/* 探针：Tab2 通电后，看小电动机卡的运动层 image 到底取的是哪一帧（验证 12 帧真的在换） */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  p.on('requestfailed', (r) => console.log('FAIL', r.url()))
  p.on('response', (r) => { if (r.url().includes('motor_s') && r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto('http://127.0.0.1:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(600)
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电动机原理'); if (d.length) d[d.length - 1].click() })
  await sleep(1400)
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')]; if (t[1]) t[1].click() })
  await sleep(900)
  for (const n of ['电池组', '开关', '小电动机']) {
    await p.evaluate((nn) => { const btn = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(nn)); if (btn) btn.click() }, n)
    await sleep(260)
  }
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return false
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    return true
  }, i)
  const termN = await p.evaluate(() => document.querySelectorAll('.esb-term').length)
  if (termN >= 6) { await clickTerm(1); await clickTerm(2); await clickTerm(3); await clickTerm(4); await clickTerm(5); await clickTerm(0) }
  await sleep(600)
  for (let i = 0; i < 6; i++) {
    const hrefs = await p.evaluate(() => [...document.querySelectorAll('image')].map((im) => im.getAttribute('href')).filter((h) => h && h.includes('motor_s')))
    console.log(i, hrefs.join(','))
    await sleep(260)
  }
  await b.close()
})()
