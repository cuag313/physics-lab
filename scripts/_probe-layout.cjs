/* 量器材卡与运动层在页面上的实际位置，用来核对 MotionLayer 的坐标偏移 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  await p.setViewport({ width: 1680, height: 1000 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(800)
  await p.evaluate(() => [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')).click())
  await sleep(500)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电功与电能表')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(1200)
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')]; if (t[1]) t[1].click() })
  await sleep(600)
  for (const n of ['交流电源', '两孔插座', '电暖器']) {
    await p.evaluate((nm) => {
      const btn = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('title') || '').startsWith(`添加${nm}（`))
      if (btn) btn.click()
    }, n)
    await sleep(200)
  }
  const info = await p.evaluate(() => {
    const comps = [...document.querySelectorAll('.esb-comp')].map((e) => {
      const r = e.getBoundingClientRect()
      return { w: e.style.width, h: e.style.height, x: Math.round(r.x), y: Math.round(r.y), txt: (e.textContent || '').slice(0, 12) }
    })
    const ml = document.querySelector('.esb-motionlayer')
    const mr = ml && ml.getBoundingClientRect()
    const cv = document.querySelector('.esb-canvas') || ml.parentElement
    const cr = cv && cv.getBoundingClientRect()
    return { comps, motion: mr && { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) }, canvas: cr && { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) } }
  })
  console.log(JSON.stringify(info, null, 1))
  await b.close()
})()
