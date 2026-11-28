const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: 'new' })
  const p = await b.newPage()
  p.on('pageerror', (e) => console.log('ERR', e.stack))
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 })
  await p.goto('http://localhost:5173/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(700)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(400)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '练习使用多用电表')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(2000)
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('button,div,span,a')].filter((x) => /自己动手/.test(x.innerText || '') && (x.innerText || '').length < 14)
    if (t.length) t[0].click()
  })
  await sleep(1200)
  // 机械调零两次
  for (let i = 0; i < 2; i += 1) {
    await p.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('机械调零')); if (el) el.click() })
    await sleep(500)
  }
  // 档位选 Ω×1
  await p.select('select', 'ohm1').catch((e) => console.log('SEL_ERR', e.message))
  await sleep(900)
  // 短接表笔
  await p.evaluate(() => { const el = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('短接表笔')); if (el) el.click() })
  await sleep(1200)
  await p.screenshot({ path: 'shot-mm-ohmzero.png' })
  console.log('TASKBAR', await p.evaluate(() => (document.body.innerText.match(/任务 \d\/8/) || [''])[0]))
  console.log('done')
  await b.close()
})()
