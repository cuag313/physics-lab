const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'audit/fidelity'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const CARD = process.argv[2] || '电生磁（奥斯特实验）'
const TAG = process.argv[3] || 'os'

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })

  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(400)
  await p.evaluate((name) => {
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === name)
    if (cards.length) cards[cards.length - 1].click()
  }, CARD)
  await sleep(1500)
  await p.evaluate(() => { const t = document.querySelectorAll('.scene-tab')[1]; if (t) t.click() })
  await sleep(900)

  const clickPal = (name) => p.evaluate((n) => {
    const btn = [...document.querySelectorAll('button')].find((b2) => (b2.innerText || '').includes(n))
    if (btn) btn.click()
  }, name)
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return false
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    return true
  }, i)
  const setBox = (i) => p.evaluate((idx) => {
    const e = [...document.querySelectorAll('.esb-comp')][idx]
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }
  }, i)

  /* 柱序：奥斯特板 0=a 1=b；电池组 2=n(−) 3=p(+)；开关 4=a 5=b */
  await clickPal('奥斯特板'); await sleep(600)
  await clickPal('电池组'); await sleep(500)
  await clickPal('开关'); await sleep(700)

  await clickTerm(1); await clickTerm(3)   // 板 b ↔ 电池 +
  await clickTerm(2); await clickTerm(4)   // 电池 − ↔ 开关 a
  await clickTerm(5); await clickTerm(0)   // 开关 b ↔ 板 a
  await sleep(900)
  await p.screenshot({ path: `${OUT}/${TAG}-wired.png` })
  await p.screenshot({ path: `${OUT}/${TAG}-wired-zoom.png`, clip: await setBox(0) })

  /* 合闸 */
  const swBox = await setBox(2)
  await p.mouse.click(swBox.x + swBox.width / 2, swBox.y + swBox.height / 2)
  await sleep(1200)
  await p.screenshot({ path: `${OUT}/${TAG}-tab2-on.png` })
  await p.screenshot({ path: `${OUT}/${TAG}-tab2-on-zoom.png`, clip: await setBox(0) })

  const bdText = await p.evaluate(() => [...document.querySelectorAll('.esb-comp')][0].innerText)
  console.log('board text:', JSON.stringify(bdText))

  /* 透视下再拍一张 */
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b2) => (b2.innerText || '').includes('内部结构'))
    if (btn) btn.click()
  })
  await sleep(800)
  await p.screenshot({ path: `${OUT}/${TAG}-tab2-on-xray.png`, clip: await setBox(0) })

  const recText = await p.evaluate(() => {
    const e = document.querySelector('.esb-record, .esb-log, [class*="record"]')
    return e ? e.innerText : '(no record panel)'
  })
  console.log('record:', JSON.stringify(recText).slice(0, 240))
  console.log('errors:', errors.length ? errors : '(none)')
  await b.close()
})()
