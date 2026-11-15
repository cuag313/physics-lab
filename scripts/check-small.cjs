const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'audit/fidelity'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const SCENES = [
  ['简单电路', 'small-simple'],
  ['练习使用滑动变阻器', 'small-rheo'],
  ['伏安法测定值电阻', 'small-va'],
  ['串并联电路规律', 'small-sp'],
]

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.setViewport({ width: 1280, height: 640, deviceScaleFactor: 2 })

  for (const [name, tag] of SCENES) {
    await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
    await sleep(1200)
    await p.evaluate(() => {
      const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
      if (e) e.click()
    })
    await sleep(450)
    await p.evaluate((n) => {
      const c = [...document.querySelectorAll('div')]
        .filter((d) => (d.innerText || '').includes(n) && (d.innerText || '').length < 400)
        .sort((a, b) => a.innerText.length - b.innerText.length)
      if (c[0]) c[0].click()
    }, name)
    await sleep(1500)
    await p.screenshot({ path: `${OUT}/ohm-${tag}-1280.png` })
    const info = await p.evaluate(() => {
      const c = document.querySelector('canvas.canvas-fill')
      if (!c) return null
      const r = c.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), card: c._cardBox }
    })
    console.log(tag, JSON.stringify(info))
  }
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
