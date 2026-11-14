/* 诊断：滑变下方那条淡色圆角条是什么元素
 * 用法：node scripts/dbg-hit.cjs  （先确保 5199 dev server 在跑）
 */
const puppeteer = require('puppeteer-core')

const BASE = process.env.SHOT_URL || 'http://localhost:5199/physics-lab/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--window-size=1680,1000'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1680, height: 1000 })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1200)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (el) el.click()
  })
  await sleep(600)
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('div')].find((d) => d.innerText && d.innerText.trim() === '电学虚拟实验室')
    if (!t) return
    let card = t
    for (let i = 0; i < 8 && card; i++) {
      if ((card.innerText || '').includes('点击进入实验')) break
      card = card.parentElement
    }
    if (card) card.click()
  })
  await sleep(2500)

  const info = await page.evaluate(() => {
    const rh = document.querySelector('.esvg-comp[data-type="rheostat"]').getBoundingClientRect()
    const pts = []
    for (let dx = 20; dx < rh.width - 20; dx += 40) {
      for (let dy = 10; dy < 50; dy += 8) {
        pts.push({ x: Math.round(rh.left + dx), y: Math.round(rh.bottom + dy) })
      }
    }
    const hits = []
    for (const p of pts) {
      const els = document.elementsFromPoint(p.x, p.y)
      for (const e of els) {
        const cls = e.getAttribute('class') || ''
        if (e.tagName === 'svg' || cls.includes('partlayer') || cls.includes('canvas')) continue
        hits.push(`${p.x},${p.y} <${e.tagName}> class=${cls} fill=${e.getAttribute('fill') || ''} transform=${e.getAttribute('transform') || ''}`)
      }
    }
    return { rect: { l: Math.round(rh.left), t: Math.round(rh.top), w: Math.round(rh.width), h: Math.round(rh.height) }, hits: hits.slice(0, 40) }
  })
  console.log(JSON.stringify(info.rect))
  info.hits.forEach((h) => console.log(h))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
