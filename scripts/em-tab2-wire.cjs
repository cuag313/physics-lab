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
    const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === '电磁铁磁性影响因素')
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

  // 电磁铁先加（柱序 0=a(黑) 1=b(红)），再电池组（2=− 3=+），再开关（4=a 5=b）
  await clickPal('电磁铁')
  await sleep(600)
  await p.screenshot({ path: `${OUT}/em-tab2-add.png` })

  await clickPal('电池组')
  await sleep(500)
  await clickPal('开关')
  await sleep(700)

  await clickTerm(1); await clickTerm(3)   // 电磁铁 b(+) ↔ 电池 +
  await clickTerm(2); await clickTerm(4)   // 电池 − ↔ 开关 a
  await clickTerm(5); await clickTerm(0)   // 开关 b ↔ 电磁铁 a(−)
  await sleep(900)
  await p.screenshot({ path: `${OUT}/em-tab2-wired.png` })
  await p.screenshot({ path: `${OUT}/em-tab2-wired-zoom.png`, clip: await setBox(0) })

  // 合闸（点开关元件本体）
  const swBox = await setBox(2)
  await p.mouse.click(swBox.x + swBox.width / 2, swBox.y + swBox.height / 2)
  await sleep(900)
  await p.screenshot({ path: `${OUT}/em-tab2-on.png` })
  await p.screenshot({ path: `${OUT}/em-tab2-on-zoom.png`, clip: await setBox(0) })

  const emText = await p.evaluate(() => [...document.querySelectorAll('.esb-comp')][0].innerText)
  console.log('em text:', JSON.stringify(emText))
  const recText = await p.evaluate(() => document.querySelector('.esb-record, .esb-log, [class*="record"]')?.innerText || '(no record panel)')
  console.log('record:', JSON.stringify(recText).slice(0, 300))

  // Shift + 单击：改匝数（5→20 循环）—— 点 3 次应变成 13 匝
  const emB0 = await setBox(0)
  await p.keyboard.down('Shift')
  for (let i = 0; i < 3; i++) {
    await p.mouse.click(emB0.x + emB0.width / 2, emB0.y + emB0.height / 2)
    await sleep(120)
  }
  await p.keyboard.up('Shift')
  await sleep(700)
  await p.screenshot({ path: `${OUT}/em-tab2-turns13-zoom.png`, clip: await setBox(0) })
  console.log('after shift-clicks:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.esb-comp')][0].innerText)))

  // 双击抽铁芯
  const emB = await setBox(0)
  await p.mouse.click(emB.x + emB.width / 2, emB.y + emB.height / 2)
  await sleep(80)
  await p.mouse.click(emB.x + emB.width / 2, emB.y + emB.height / 2)
  await sleep(800)
  await p.screenshot({ path: `${OUT}/em-tab2-nocore-zoom.png`, clip: await setBox(0) })
  console.log('after dbl:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.esb-comp')][0].innerText)))

  // 透视
  await p.evaluate(() => { const d = document.querySelector('.esb-dissect'); if (d) d.click() })
  await sleep(700)
  await p.screenshot({ path: `${OUT}/em-tab2-xray.png` })

  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
