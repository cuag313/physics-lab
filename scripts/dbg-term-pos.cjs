/* 诊断：量出画布缩放，以及各接线柱命中框在屏幕上的位置 —— 用来核对"护套是否落在柱帽下方"
 * 用法：node scripts/dbg-term-pos.cjs
 */
const puppeteer = require('puppeteer-core')
const fs = require('fs')

const BASE = process.env.SHOT_URL || 'http://localhost:5199/physics-lab/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--window-size=1680,1000'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1680, height: 1000 })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1000)
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
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.btn')].find((x) => x.innerText.includes('示例电路'))
    if (b) b.click()
  })
  await sleep(1200)

  const out = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('.esvg-comp')]
    return parts.map((p) => {
      const r = p.getBoundingClientRect()
      const type = p.dataset.type || p.getAttribute('data-type')
      const svg = p.querySelector('svg')
      const sr = svg ? svg.getBoundingClientRect() : null
      const terms = [...p.querySelectorAll('.esvg-term')].map((t) => {
        const tr = t.getBoundingClientRect()
        return { name: t.getAttribute('title') || t.dataset.tid || '', x: Math.round(tr.left), y: Math.round(tr.top), w: Math.round(tr.width) }
      })
      return { type, rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        svg: sr ? { w: Math.round(sr.width), h: Math.round(sr.height) } : null, terms }
    })
  })
  console.log(JSON.stringify(out, null, 1))
  const png = await page.screenshot({ clip: { x: 0, y: 60, width: 1400, height: 640 } })
  fs.writeFileSync('audit/fidelity/dbg-terms.png', png)
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
