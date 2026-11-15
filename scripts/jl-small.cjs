const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })
  await p.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(400)
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === '探究焦耳定律')
    if (cards.length) cards[cards.length - 1].click()
  })
  await sleep(1400)
  const dbg = await p.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('canvas.canvas-fill')._dbg)))
  console.log('1280 scale', dbg.scale, 'I', dbg.I, 'card max', dbg.cardMax)
  // 闭合 + 拖到最大电流
  await p.evaluate((sx, sy, rx, ry) => {
    const c = document.querySelector('canvas.canvas-fill'); const r = c.getBoundingClientRect()
    const ev = (t, ex, ey) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + ex, clientY: r.top + ey, bubbles: true, button: 0 }))
    ev('mousedown', sx, sy); ev('mouseup', sx, sy)
    ev('mousedown', rx, ry); ev('mousemove', rx - 40, ry); ev('mouseup', rx - 40, ry)
  }, dbg.swX, dbg.swY, dbg.rheoX, dbg.rheoY + 10)
  await sleep(4000)
  await p.screenshot({ path: 'audit/fidelity/jl-1280x640.png' })
  const box = await p.evaluate(() => { const c = document.querySelector('canvas.canvas-fill'); const b2 = c._cardBox; const r = c.getBoundingClientRect(); return { ...b2, left: r.left, top: r.top } })
  console.log('card box', JSON.stringify(box))
  if (box && box.maxScroll) {
    await p.mouse.move(box.left + box.x + box.w / 2, box.top + box.y + box.h / 2)
    await p.mouse.wheel({ deltaY: box.maxScroll })
    await sleep(400)
    await p.screenshot({ path: 'audit/fidelity/jl-1280x640-scrolled.png' })
  }
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
