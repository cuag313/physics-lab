const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: 'new' })
  const p = await b.newPage()
  p.on('pageerror', (e) => console.log('ERR', e.stack))
  p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE_ERR', m.text()) })
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 })
  await p.goto('http://localhost:5173/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(800)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(500)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '练习使用多用电表')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(2500)
  await p.screenshot({ path: 'shot-mm-tab1.png' })
  // 切 Tab2
  await p.evaluate(() => {
    const els = [...document.querySelectorAll('button,div,span,a')]
    const t = els.filter((x) => /自己动手/.test(x.innerText || '') && (x.innerText || '').length < 14)
    if (t.length) t[0].click()
  })
  await sleep(1800)
  await p.screenshot({ path: 'shot-mm-tab2.png' })
  console.log('done')
  await b.close()
})()
