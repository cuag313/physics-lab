/* 电表改装与校准：Tab1 四步 + Tab2 校准台 截图核对 */
const fs = require('fs')
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'audit/meterconv'
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
  const pillH = Math.round(30 * k), gap = 8, pad = 14
  const pillW = Math.min(190 * k, (b.w - pad * 2 - gap * 3) / 4)
  const pills = [0,1,2,3].map(i => ({ x: r.left + b.x + pad + i * (pillW + gap) + pillW / 2, y: r.top + b.y + 12 + pillH / 2 }))
  const dpw = compact ? 0 : Math.min(330, b.w * 0.31)
  const circ = { x: b.x + pad, y: b.y + 56, w: b.w - pad * 2 - (dpw ? dpw + 16 : 0), h: b.h - 68 }
  const ctrlY = circ.y + circ.h - 96 * k
  const errW = Math.min(300 * k, circ.w * 0.46)
  const btnY = ctrlY + 62 * k, btnH = 28 * k
  const bx0 = circ.x + errW + 18 * k
  const btn = (off, w) => ({ x: r.left + bx0 + off + w / 2, y: r.top + btnY + btnH / 2 })
  const eps = { x0: r.left + circ.x, x1: r.left + circ.x + errW, y: r.top + ctrlY + 8 * k + 16 * k * 0.9 }
  const pw = Math.min(140 * k, 120 + 10 * k)
  const mode = [0, 1].map(i => ({ x: r.left + b.x + pad + i * (pw + 8) + pw / 2, y: r.top + b.y + 12 + pillH / 2 }))
  return {
    rect: { left: r.left, top: r.top, w: W, h: H },
    k, compact, circ,
    pills,
    mode,
    record: btn(0, 100 * k),
    five: btn(100 * k + 8 * k, 100 * k),
    clear: btn(216 * k + 16 * k, 74 * k),
    eps,
  }
})()`

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto(BASE, { waitUntil: 'networkidle2' })
  await sleep(800)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(500)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电表改装与校准')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(1500)
  const geo = await p.evaluate(GEO)
  console.log('GEO', JSON.stringify(geo))
  if (!geo) { console.log('canvas not found'); await b.close(); return }

  await p.screenshot({ path: `${OUT}/t1-s1-head.png` })
  for (const [idx, name] of [[1, 't1-s2-ammeter'], [2, 't1-s3-voltmeter'], [3, 't1-s4-essence']]) {
    await p.mouse.click(geo.pills[idx].x, geo.pills[idx].y)
    await sleep(700)
    await p.screenshot({ path: `${OUT}/${name}.png` })
  }

  // Tab2
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')].find((x) => x.innerText.includes('校准实验')); if (t) t.click() })
  await sleep(900)
  await p.screenshot({ path: `${OUT}/t2-a-bench.png` })
  const g2 = await p.evaluate(GEO)
  await p.mouse.click(g2.five.x, g2.five.y)
  await sleep(900)
  await p.screenshot({ path: `${OUT}/t2-b-five-points.png` })
  // 误差注入 +15%
  const g3 = await p.evaluate(GEO)
  await p.mouse.move(g3.eps.x0 + (g3.eps.x1 - g3.eps.x0) * 0.5, g3.eps.y)
  await p.mouse.down()
  await p.mouse.move(g3.eps.x0 + (g3.eps.x1 - g3.eps.x0) * 0.875, g3.eps.y, { steps: 12 })
  await p.mouse.up()
  await sleep(500)
  await p.mouse.click(g3.five.x, g3.five.y)
  await sleep(900)
  await p.screenshot({ path: `${OUT}/t2-c-eps-plus.png` })
  // 电压表模式
  await p.mouse.click(g3.mode[1].x, g3.mode[1].y)
  await sleep(900)
  const g4 = await p.evaluate(GEO)
  await p.mouse.click(g4.five.x, g4.five.y)
  await sleep(900)
  await p.screenshot({ path: `${OUT}/t2-d-volt.png` })

  // 窄屏
  await p.setViewport({ width: 1200, height: 700, deviceScaleFactor: 2 })
  await sleep(900)
  await p.screenshot({ path: `${OUT}/compact.png` })

  console.log('ERRORS', JSON.stringify(errors))
  await b.close()
})()
