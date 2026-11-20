/* 量小电动机卡片上两个接线柱在卡内的相对坐标（剖视里要把柱子画回去） */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 })
  await p.goto('http://127.0.0.1:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => {
    const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (e) e.click()
  })
  await sleep(600)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电动机原理')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(1400)
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')]; if (t[1]) t[1].click() })
  await sleep(900)
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('小电动机'))
    if (btn) btn.click()
  })
  await sleep(500)
  const out = await p.evaluate(() => {
    const list = [...document.querySelectorAll('.esb-comp')]
    const e = list.find((x) => x.innerHTML.includes('motor_c'))
    if (!e) return null
    const r = e.getBoundingClientRect()
    return [...e.querySelectorAll('.esb-term')].map((t) => {
      const q = t.getBoundingClientRect()
      return { x: +(q.x + q.width / 2 - r.x).toFixed(1), y: +(q.y + q.height / 2 - r.y).toFixed(1) }
    })
  })
  console.log(JSON.stringify(out))
  await b.close()
})()
