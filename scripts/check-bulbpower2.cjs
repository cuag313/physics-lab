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

  const open = async (name) => {
    await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
    await sleep(1000)
    await p.evaluate(() => {
      const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
      if (e) e.click()
    })
    await sleep(450)
    await p.evaluate((n) => {
      const cards = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').trim() === n)
      if (cards.length) { cards[cards.length - 1].click(); return }
      const alt = [...document.querySelectorAll('div')].filter((d) => (d.innerText || '').includes(n))
      if (alt.length) alt[alt.length - 1].click()
    }, name)
    await sleep(1500)
    return p.evaluate(() => {
      const tabs = [...document.querySelectorAll('.scene-tab')].map((e) => e.innerText)
      const desc = document.querySelector('.scene-desc') ? document.querySelector('.scene-desc').innerText : ''
      const palette = [...document.querySelectorAll('.palette-item, .builder-palette [class*=item]')].map((e) => e.innerText.split('\n')[0])
      return { tabs, desc, palette }
    })
  }

  const A = await open('伏安法测小灯泡电功率')
  console.log('A', JSON.stringify(A))
  // 切 Tab2
  await p.evaluate(() => {
    const t = document.querySelectorAll('.scene-tab')[1]
    if (t) t.click()
  })
  await sleep(1200)
  await p.screenshot({ path: `${OUT}/bp-tab2.png` })
  const t2 = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean)
    return { btns }
  })
  console.log('tab2 btns', JSON.stringify(t2))

  const B = await open('伏安法测定值电阻')
  console.log('B', JSON.stringify(B))
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
