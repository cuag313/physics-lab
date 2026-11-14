/* 诊断：导线端点是否落在接线柱下方
 * 输出每个 wire 组的 path d 首尾坐标 + 两端 boot 圆心，以及各元件的接线柱位置
 * 用法：先开 5199 dev server，然后 node scripts/dbg-wire-endpoints.cjs
 */
const path = require('path')
const puppeteer = require('puppeteer-core')

const BASE = process.env.SHOT_URL || 'http://localhost:5199/physics-lab/'
const OUT = path.resolve(__dirname, '..', 'audit', 'fidelity')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function center(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, sel)
}

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

  const data = await page.evaluate(() => {
    const canvas = document.querySelector('.esvg-canvas')
    const cr = canvas.getBoundingClientRect()
    const toCanvas = (x, y) => ({ x: +(x - cr.left).toFixed(1), y: +(y - cr.top).toFixed(1) })

    const comps = [...document.querySelectorAll('.esvg-comp')].map((d) => {
      const r = d.getBoundingClientRect()
      const terms = [...d.querySelectorAll('.esvg-term')].map((t) => {
        const tr = t.getBoundingClientRect()
        return {
          title: t.getAttribute('title'),
          // term div 是 20×20，left/top = tm.x-9 / tm.y-9，中心即接线柱坐标
          anchor: toCanvas(tr.left + tr.width / 2, tr.top + tr.height / 2),
          style: t.getAttribute('style'),
        }
      })
      return { type: d.dataset.type, id: d.dataset.id, rect: toCanvas(r.left, r.top), size: [r.width, r.height], terms }
    })

    const wires = [...document.querySelectorAll('.esvg-wirelayer > svg g, .esvg-wirelayer g')].map((g) => {
      const p = [...g.querySelectorAll('path')].map((x) => x.getAttribute('d')).filter(Boolean)
      const boots = [...g.querySelectorAll('circle')].map((c) => {
        const m = (c.parentElement.getAttribute('transform') || '').match(/translate\(([-\d.]+),([-\d.]+)\)/)
        return m ? { x: +m[1], y: +m[2], r: c.getAttribute('r') } : null
      }).filter(Boolean)
      return { d: p[0], boots }
    })
    return { comps, wires }
  })

  console.log('=== 元件接线柱（画布坐标，柱帽中心） ===')
  for (const c of data.comps) {
    console.log(c.type, '#' + c.id, 'at', JSON.stringify(c.rect), JSON.stringify(c.terms))
  }
  console.log('=== 导线 ===')
  data.wires.forEach((w, i) => {
    console.log(i, 'd=', (w.d || '').slice(0, 120), '...')
    console.log('   boots=', JSON.stringify(w.boots))
  })
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
