/* 探针：小电动机卡的 CSS 序列帧动画到底在不在跑（getAnimations().currentTime / playState） */
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
  await sleep(700)

  const probe = () => p.evaluate(() => {
    const im = [...document.querySelectorAll('image')].find((x) => (x.getAttribute('href') || '').includes('motor_sheet'))
    if (!im) return { found: false }
    const anims = im.getAnimations ? im.getAnimations() : []
    return {
      found: true,
      style: im.getAttribute('style'),
      anims: anims.map((a) => ({ t: Math.round(a.currentTime || 0), state: a.playState })),
      transform: getComputedStyle(im).transform,
    }
  })
  console.log('p1', JSON.stringify(await probe()))
  await sleep(600)
  console.log('p2', JSON.stringify(await probe()))
  await b.close()
})()
