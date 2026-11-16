/* 匝数可调验收：Tab1 点 [-]/[+] 改匝数（5~20），看线圈圈数、磁力线、吸针数怎么变 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'audit/fidelity'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const CARD = process.argv[2] || '电磁铁磁性影响因素'
const W = Number(process.argv[3] || 1680)
const H = Number(process.argv[4] || 1000)

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 2 })
  await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)

  await p.evaluate((name) => {
    const tab = [...document.querySelectorAll('.category-tab')].find((el) => el.innerText.includes('电学'))
    if (tab) tab.click()
  }, CARD)
  await sleep(450)
  await p.evaluate((name) => {
    const els = [...document.querySelectorAll('div')].filter((el) => el.innerText.trim() === name)
    if (els.length) els[els.length - 1].click()
  }, CARD)
  await sleep(1500)

  const dbg = () => p.evaluate(() => {
    const c = document.querySelector('canvas')
    return c && c._dbg ? JSON.parse(JSON.stringify(c._dbg)) : null
  })
  const d0 = await dbg()
  if (!d0) { console.log('no dbg'); await b.close(); return }
  const box = await p.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y }
  })
  const click = async (x, y) => {
    await p.mouse.click(box.x + x, box.y + y)
    await sleep(220)
  }
  // 合闸
  await click(d0.swX, d0.swY)
  await sleep(700)
  // 先把滑片拖到阻值小处（I≈0.6A），磁性才够大、匝数差别才看得清
  await p.mouse.move(box.x + d0.rheoX, box.y + d0.rheoY + 10)
  await p.mouse.down()
  await sleep(120)
  await p.mouse.move(box.x + d0.rheoX - 14, box.y + d0.rheoY + 10, { steps: 12 })
  await sleep(120)
  await p.mouse.up()
  await sleep(500)
  console.log('closed 10t:', JSON.stringify((await dbg()) && { t: (await dbg()).turns, I: (await dbg()).I, pins: (await dbg()).pins }))

  // 点 + 到 20 匝
  const plus = await dbg()
  for (let i = 0; i < 10; i++) await click(plus.turnsCtl.plusX, plus.turnsCtl.y)
  const t20 = await dbg()
  console.log('turns max:', t20.turns, 'I', t20.I.toFixed(3), 'pins', t20.pins, 'strength', t20.strength.toFixed(2))
  await p.screenshot({ path: `${OUT}/em-turns20.png`, clip: { x: box.x + d0.emX - 200, y: box.y + d0.swY - 195, width: 400, height: 265 } })

  // 点 − 到 5 匝
  for (let i = 0; i < 20; i++) await click(plus.turnsCtl.minusX, plus.turnsCtl.y)
  const t5 = await dbg()
  console.log('turns min:', t5.turns, 'I', t5.I.toFixed(3), 'pins', t5.pins, 'strength', t5.strength.toFixed(2))
  await p.screenshot({ path: `${OUT}/em-turns5.png`, clip: { x: box.x + d0.emX - 200, y: box.y + d0.swY - 195, width: 400, height: 265 } })

  // 回 10 匝（同一滑片位置，公平对比）
  for (let i = 0; i < 5; i++) await click(plus.turnsCtl.plusX, plus.turnsCtl.y)
  const t10 = await dbg()
  console.log('back to:', t10.turns, 'I', t10.I.toFixed(3), 'pins', t10.pins, 'strength', t10.strength.toFixed(2))
  await p.screenshot({ path: `${OUT}/em-t10.png`, clip: { x: box.x + d0.emX - 200, y: box.y + d0.swY - 195, width: 400, height: 265 } })
  console.log('errors:', errors.length ? errors.slice(0, 4) : '(none)')
  await b.close()
})()
