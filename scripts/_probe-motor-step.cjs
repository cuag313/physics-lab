/* 探针 5：分阶段打印（器材数 / 接线柱数 / 电流 chip / 运动层节点），定位"通电后卡片不换帧"卡在哪一步 */
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
    await sleep(280)
  }
  const state = () => p.evaluate(() => {
    const ml = document.querySelector('.esb-motionlayer')
    return {
      terms: document.querySelectorAll('.esb-term').length,
      comps: document.querySelectorAll('.esb-comp').length,
      layerNodes: ml ? ml.childElementCount : -1,
      kids: ml ? [...ml.children].map((k) => k.nodeName + ':' + (k.getAttribute('href') || k.getAttribute('class') || '')) : [],
      html: ml ? ml.innerHTML.slice(0, 400) : '',
      chip: [...document.querySelectorAll('text')].map((t) => t.textContent).filter((x) => x && x.includes('I =')),
    }
  })
  console.log('A add', JSON.stringify(await state()))
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return false
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    return true
  }, i)
  for (const i of [1, 2, 3, 4, 5, 0]) { console.log('term', i, await clickTerm(i)); await sleep(90) }
  await sleep(500)
  console.log('B wired', JSON.stringify(await state()))
  const swBox = await p.evaluate(() => { const sw = [...document.querySelectorAll('.esb-comp')][1]; if (!sw) return null; const r = sw.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })
  if (swBox) await p.mouse.click(swBox.x + swBox.width / 2, swBox.y + swBox.height / 2)
  await sleep(1000)
  console.log('C closed', JSON.stringify(await state()))
  await sleep(900)
  console.log('D later', JSON.stringify(await state()))
  await b.close()
})()

