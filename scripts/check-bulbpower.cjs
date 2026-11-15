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
    await sleep(1600)
    return p.evaluate(() => {
      const h = document.querySelector('.scene-head, header')
      const texts = [...document.querySelectorAll('h1,h2,.scene-title')].map((e) => e.innerText)
      const c = document.querySelector('canvas.canvas-fill')
      const dbg = c && c._dbg ? JSON.parse(JSON.stringify(c._dbg)) : null
      return { titles: texts, dbg }
    })
  }

  // A) 目录里「伏安法测小灯泡电功率」
  const A = await open('伏安法测小灯泡电功率')
  console.log('A bulbPower ->', JSON.stringify(A.titles), 'dbg=', JSON.stringify(A.dbg))
  await p.screenshot({ path: `${OUT}/bp-tab1-open.png` })

  // 闭合开关，拖滑片到最小阻值
  await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    const d = c._dbg
    const r = c.getBoundingClientRect()
    const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
    ev('mousedown', d.swX, d.swY)
    ev('mouseup', d.swX, d.swY)
  })
  await sleep(700)
  const closed = await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    return JSON.parse(JSON.stringify(c._dbg))
  })
  console.log('A closed dbg=', JSON.stringify(closed))
  await p.screenshot({ path: `${OUT}/bp-tab1-closed.png` })

  // 拖滑片到左端（R1=0）
  await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    const d = c._dbg
    const r = c.getBoundingClientRect()
    const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
    ev('mousedown', d.rheoX - d.hRheo + 4, d.rheoY + 10)
    ev('mousemove', d.rheoX - d.hRheo + 2, d.rheoY + 10)
    ev('mouseup', d.rheoX - d.hRheo + 2, d.rheoY + 10)
  })
  await sleep(700)
  // 记录一组
  await p.evaluate(() => {
    const c = document.querySelector('canvas.canvas-fill')
    const d = c._dbg
    const r = c.getBoundingClientRect()
    const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
    ev('mousedown', d.recX, d.recY)
    ev('mouseup', d.recX, d.recY)
  })
  await sleep(500)
  await p.screenshot({ path: `${OUT}/bp-tab1-rec1.png` })

  // B) 再打开「伏安法测定值电阻」，比较是否同一页面
  const B = await open('伏安法测定值电阻')
  console.log('B voltAmpereResistor ->', JSON.stringify(B.titles))

  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
