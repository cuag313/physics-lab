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
  await p.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(1000)
  await p.evaluate(() => {
    const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (e) e.click()
  })
  await sleep(450)
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === '伏安法测小灯泡电功率')
    if (cards.length) cards[cards.length - 1].click()
  })
  await sleep(1500)
  const d0 = await p.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('canvas.canvas-fill')._dbg)))
  console.log('card', JSON.stringify(d0.card), 'maxScroll', d0.cardMax)
  await p.screenshot({ path: `${OUT}/bp-scroll-top.png` })

  // 在卡片内滚 4 次，每次 160px
  for (let i = 0; i < 4; i++) {
    await p.evaluate((cx, cy) => {
      const c = document.querySelector('canvas.canvas-fill')
      const r = c.getBoundingClientRect()
      c.dispatchEvent(new WheelEvent('wheel', { deltaY: 160, clientX: r.left + cx, clientY: r.top + cy, bubbles: true }))
    }, d0.card.x + 40, d0.card.y + 60)
    await sleep(260)
  }
  const d1 = await p.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('canvas.canvas-fill')._dbg)))
  console.log('after wheel cardScroll=', d1.cardScroll, '/', d1.cardMax)
  await p.screenshot({ path: `${OUT}/bp-scroll-bottom.png` })

  // 拖动卡片也应能滚（回到顶部再拖下去）
  await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    const r = c.getBoundingClientRect()
    const dd = c._dbg
    const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
    ev('mousedown', dd.card.x + 40, dd.card.y + 60)
    ev('mousemove', dd.card.x + 40, dd.card.y + 60 - 400)
    ev('mouseup', dd.card.x + 40, dd.card.y + 60 - 400)
  })
  await sleep(400)
  const d2 = await p.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('canvas.canvas-fill')._dbg)))
  console.log('after drag cardScroll=', d2.cardScroll, '/', d2.cardMax)
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
