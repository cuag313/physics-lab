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
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(400)
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === '探究焦耳定律')
    if (cards.length) cards[cards.length - 1].click()
  })
  await sleep(1400)
  await p.evaluate(() => { const t = document.querySelectorAll('.scene-tab')[1]; if (t) t.click() })
  await sleep(900)
  await p.screenshot({ path: `${OUT}/jl-set-1280x640.png` })

  // 器材栏是否能滚到第 10 件
  const palInfo = await p.evaluate(() => {
    const list = document.querySelector('.toolbox-list')
    return list ? { sh: list.scrollHeight, ch: list.clientHeight } : null
  })
  await p.evaluate(() => {
    const list = document.querySelector('.toolbox-list')
    if (list) list.scrollTop = list.scrollHeight
  })
  await sleep(400)
  await p.screenshot({ path: `${OUT}/jl-set-1280x640-palette.png` })

  const lastBtn = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.toolbox-list button')]
    const t = btns[btns.length - 1]
    const r = t.getBoundingClientRect()
    return { name: (btns.find((x) => x.innerText.includes('焦耳演示器')) || {}).innerText, bottom: r.bottom }
  })
  console.log('palette', JSON.stringify(palInfo), JSON.stringify(lastBtn))
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
