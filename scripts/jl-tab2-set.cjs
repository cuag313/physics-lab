const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'audit/fidelity'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

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
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === '探究焦耳定律')
    if (cards.length) cards[cards.length - 1].click()
  })
  await sleep(1400)
  await p.evaluate(() => { const t = document.querySelectorAll('.scene-tab')[1]; if (t) t.click() })
  await sleep(900)

  const clickPal = (name) => p.evaluate((n) => {
    const btn = [...document.querySelectorAll('button')].find((b2) => (b2.innerText || '').includes(n))
    if (btn) btn.click()
  }, name)
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
  }, i)
  const setBox = (i) => p.evaluate((idx) => {
    const e = [...document.querySelectorAll('.esb-comp')][idx]
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: Math.max(0, r.x - 6), y: Math.max(0, r.y - 6), width: r.width + 12, height: r.height + 12 }
  }, i)

  await clickPal('焦耳演示器')
  await sleep(600)
  await p.screenshot({ path: `${OUT}/jl-tab2-set.png` })
  await p.screenshot({ path: `${OUT}/jl-set-zoom.png`, clip: await setBox(0) })

  await clickPal('电池组')
  await sleep(600)
  // 演示器先加 → 柱序 [0]=A1 [1]=A2 [2]=B1 [3]=B2，电池 [4]=− [5]=+
  await clickTerm(1); await clickTerm(2)   // A2 ↔ B1（两组串联）
  await clickTerm(3); await clickTerm(4)   // B2 ↔ 电池 −
  await clickTerm(5); await clickTerm(0)   // 电池 + ↔ A1
  await sleep(800)
  await p.screenshot({ path: `${OUT}/jl-tab2-wired.png` })

  await sleep(9000)
  await p.screenshot({ path: `${OUT}/jl-tab2-heat.png` })
  await p.screenshot({ path: `${OUT}/jl-set-zoom-hot.png`, clip: await setBox(0) })

  const temps = await p.evaluate(() => [...document.querySelectorAll('.esb-comp')][0].innerText)
  console.log('set text:', JSON.stringify(temps))

  // 透视态
  await p.evaluate(() => { const d = document.querySelector('.esb-dissect'); if (d) d.click() })
  await sleep(700)
  await p.screenshot({ path: `${OUT}/jl-set-zoom-xray.png`, clip: await setBox(0) })

  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
