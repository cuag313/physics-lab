/* 诊断：电能表标签层有没有渲染、z-index 生效没有 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  p.on('console', (m) => console.log('[console]', m.text()))
  p.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => {
    const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (e) e.click()
  })
  await sleep(500)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电功与电能表')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(1400)
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')]; if (t[1]) t[1].click() })
  await sleep(700)
  await p.evaluate(() => {
    const bt = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().includes('电能表'))
    if (bt) bt.click()
  })
  await sleep(600)
  const info = await p.evaluate(() => {
    const layers = [...document.querySelectorAll('.esb-taglayer')]
    const svgs = layers.map((l) => ({ html: l.innerHTML.length, kids: l.children.length, z: getComputedStyle(l).zIndex }))
    const comps = [...document.querySelectorAll('.esb-comp')].map((c) => c.style.left + ',' + c.style.top + ' ' + c.style.width)
    return { layers: svgs, comps }
  })
  console.log(JSON.stringify(info, null, 1))
  await b.close()
})()
