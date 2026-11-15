// 电磁铁演示图局部放大（看绕向 / 小磁针 / 铁芯穿过）
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'audit/fidelity'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(400)
  await p.evaluate((name) => {
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === name)
    if (cards.length) cards[cards.length - 1].click()
  }, '电磁铁磁性影响因素')
  await sleep(1500)

  const dbg = () => p.evaluate(() => {
    const c = document.querySelector('canvas')
    return c && c._dbg ? JSON.parse(JSON.stringify(c._dbg)) : null
  })
  const canvasBox = await p.evaluate(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
    })
  const toPage = (x, y) => ({ x: canvasBox.x + x, y: canvasBox.y + y })

  let d = await dbg()
  const clip = { x: canvasBox.x + d.emX - 165, y: canvasBox.y + d.swY - 175, width: 330, height: 235 }

  // 断开态先拍（磁针自由指向）
  await p.screenshot({ path: `${OUT}/em-zoom-open.png`, clip })
  // 合闸
  await p.mouse.click(toPage(d.swX, d.swY).x, toPage(d.swX, d.swY).y)
  await sleep(150)
  await p.screenshot({ path: `${OUT}/em-zoom-spin.png`, clip })   // 磁针摆动中
  await sleep(900)
  await p.screenshot({ path: `${OUT}/em-zoom-on.png`, clip })
  // 抽铁芯
  d = await dbg()
  const cb = toPage(d.coreBtn.x, d.coreBtn.y)
  await p.mouse.click(cb.x, cb.y)
  await sleep(700)
  await p.screenshot({ path: `${OUT}/em-zoom-nocore.png`, clip })
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
