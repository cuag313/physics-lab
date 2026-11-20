/* 探针 3：把「🔍 电机结构」打开（cut=true 时无论有无电流都会产生 motor 运动项），
   看 React 运动层里到底有没有 motor 节点、有没有标注 —— 顺便出一张局部图。 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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
    await sleep(260)
  }
  await p.evaluate(() => { const b2 = document.querySelector('.esb-cut'); if (b2) b2.click() })
  await sleep(900)
  const info = await p.evaluate(() => {
    const ml = document.querySelector('.esb-motionlayer')
    return { nodes: ml ? ml.childElementCount : -1, kids: ml ? [...ml.children].map((k) => k.nodeName + ':' + (k.getAttribute('href') || k.getAttribute('class') || '')) : [] }
  })
  console.log('cut-mode motionlayer', JSON.stringify(info))
  const box = await p.evaluate(() => {
    const el = [...document.querySelectorAll('.esb-comp')].find((x) => x.innerHTML.includes('motor_s0'))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  console.log('box', JSON.stringify(box))
  if (box) await p.screenshot({ path: 'audit/fidelity/m116-cut-zoom.png', clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } })
  await b.close()
})()
