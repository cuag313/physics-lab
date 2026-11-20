const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 })
  await p.goto('http://127.0.0.1:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(700)
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电动机原理'); if (d.length) d[d.length - 1].click() })
  await sleep(1500)
  const tabs = await p.evaluate(() => [...document.querySelectorAll('.scene-tab')].map((x) => x.innerText.trim()))
  console.log('tabs', JSON.stringify(tabs))
  const boxes = await p.evaluate(() => [...document.querySelectorAll('.scene-tab')].map((x) => { const r = x.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }))
  console.log('boxes', JSON.stringify(boxes))
  const t2 = boxes[boxes.length - 1]
  await p.mouse.click(t2.x + t2.w / 2, t2.y + t2.h / 2)
  await sleep(900)
  const st = await p.evaluate(() => ({
    tabs: [...document.querySelectorAll('.scene-tab')].map((x) => [x.innerText.trim(), x.className]),
    comps: [...document.querySelectorAll('.esb-comp')].length,
    hasMotorBtn: [...document.querySelectorAll('button')].some((x) => x.innerText.includes('小电动机')),
  }))
  console.log('after', JSON.stringify(st))
  await p.screenshot({ path: 'audit/fidelity/_tabcheck.png' })
  await b.close()
})()
