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
  const d = await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    return c && c._dbg ? JSON.parse(JSON.stringify(c._dbg)) : null
  })
  // 闭合开关 + 拖到额定电压附近
  await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    const dd = c._dbg
    const r = c.getBoundingClientRect()
    const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
    ev('mousedown', dd.swX, dd.swY); ev('mouseup', dd.swX, dd.swY)
  })
  await sleep(500)
  await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    const dd = c._dbg
    const r = c.getBoundingClientRect()
    const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
    ev('mousedown', dd.rheoX + 6, dd.rheoY + 10)
    ev('mousemove', dd.rheoX - 6, dd.rheoY + 10)
    ev('mouseup', dd.rheoX - 6, dd.rheoY + 10)
  })
  await sleep(600)
  const d2 = await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    return JSON.parse(JSON.stringify(c._dbg))
  })
  console.log('1280', JSON.stringify({ w: 1280, h: 523, U: d2.U, I: d2.I, P: d2.P, scale: d2.scale }))
  await p.screenshot({ path: `${OUT}/bp-1280x640.png` })
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
