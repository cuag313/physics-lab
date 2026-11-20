/* 验证：通电后连拍 8 张小电动机卡，看画面是否在变（序列帧是否真的在转） */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const crypto = require('crypto')
const fs = require('fs')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
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
    await sleep(280)
  }
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return false
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    return true
  }, i)
  for (const i of [1, 2, 3, 4, 5, 0]) await clickTerm(i)
  await sleep(400)
  const swBox = await p.evaluate(() => { const sw = [...document.querySelectorAll('.esb-comp')][1]; if (!sw) return null; const r = sw.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  if (swBox) await p.mouse.click(swBox.x + swBox.width / 2, swBox.y + swBox.height / 2)
  await sleep(500)

  const box = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.esb-comp')].find((x) => x.innerHTML.includes('esmm'))
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  for (let i = 0; i < 8; i++) {
    const f = `audit/fidelity/_spin${i}.png`
    await p.screenshot({ path: f, clip: box })
    const h = crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 8)
    console.log(i, h)
    await sleep(140)
  }
  await b.close()
})()




