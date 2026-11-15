const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const SCENES = [
  ['练习使用滑动变阻器', 'rheo'],
  ['伏安法测定值电阻', 'va'],
  ['串并联', 'sp'],
]

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })

  for (const [w, h] of [[1366, 768], [1600, 900]]) {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
    await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
    await sleep(900)
    await p.evaluate(() => {
      const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
      if (e) e.click()
    })
    await sleep(400)
    for (const [name, tag] of SCENES) {
      await p.evaluate((nm) => {
        const cards = [...document.querySelectorAll('div')].filter((d) => {
          const t = (d.innerText || '').trim()
          return t.length < 40 && t.includes(nm)
        })
        if (cards.length) cards[cards.length - 1].click()
      }, name)
      await sleep(1300)
      const info = await p.evaluate(() => {
        const c = document.querySelector('canvas.canvas-fill')
        if (!c) return null
        const box = c._cardBox
        return box ? { maxScroll: box.maxScroll, w: box.w, h: box.h } : { maxScroll: null }
      })
      console.log(`${w}x${h} ${tag}:`, JSON.stringify(info))
      // 返回目录
      await p.evaluate(() => {
        const bk = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('返回目录'))
        if (bk) bk.click()
      })
      await sleep(800)
      await p.evaluate(() => {
        const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
        if (e) e.click()
      })
      await sleep(400)
    }
  }
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
