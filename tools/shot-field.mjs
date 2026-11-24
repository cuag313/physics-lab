/**
 * 截图工具：「电场线与电场强度」
 * 用法：node tools/shot-field.mjs [宽] [高] [输出] [模式]
 *   模式：step1 | step2 | step3 | probe | diy1
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const OUT = process.argv[4] || `shot-field-${W}x${H}.png`
const MODE = process.argv[5] || 'step1'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--no-sandbox', '--disable-gpu-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

async function clickText(text, { exact = false } = {}) {
  const pos = await page.evaluate((txt, isExact) => {
    const els = [...document.querySelectorAll('body *')].filter((n) => {
      const own = (n.textContent || '').trim()
      if (!own || n.children.length > 3) return false
      return isExact ? own === txt : own.includes(txt)
    })
    const el = els[els.length - 1]
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, text, exact)
  if (!pos) return false
  await page.mouse.click(pos.x, pos.y)
  return true
}

async function areaRect(name) {
  return page.evaluate((n) => {
    const c = document.querySelector('canvas')
    const d = c && c._dbg
    if (!d) return null
    const a = d.areas.find((x) => x.n === n)
    if (!a) return null
    const r = c.getBoundingClientRect()
    return { x: r.x + a.x, y: r.y + a.y, w: a.w, h: a.h }
  }, name)
}
async function clickArea(name) {
  const a = await areaRect(name)
  if (!a) { console.log('miss area:', name); return false }
  await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2)
  await sleep(600)
  return true
}
async function setSlider(name, ratio) {
  const a = await areaRect(name)
  if (!a) { console.log('miss slider:', name); return false }
  const x = a.x + 10 + ratio * (a.w - 20)
  await page.mouse.click(x, a.y + a.h / 2)
  await sleep(500)
  return true
}
async function dragInCanvas(from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 })
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  await sleep(500)
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学')
await sleep(900)
await clickText('电场线与电场强度', { exact: true })
await sleep(2400)

if (MODE === 'step2') { await clickArea('step2') }
if (MODE === 'step3') { await clickArea('step3') }
if (MODE === 'step4') { await clickArea('step4') }
if (MODE === 'qhi' || MODE === 'qlo' || MODE === 'eq' || MODE === 'eq3' || MODE === 'plate') {
  if (MODE === 'eq' || MODE === 'eq3') { await clickArea('eqBtn'); await sleep(400) }
  if (MODE === 'eq3' || MODE === 'plate') {
    await clickArea('step3'); await sleep(600)
    await setSlider('uSlider', 0.85); await setSlider('dSlider', 0.66)
    if (MODE === 'plate') await clickArea('eqBtn')
  } else {
    await setSlider('qSlider', MODE === 'qhi' ? 0.98 : 0.02)
  }
  await sleep(700)
}
if (MODE === 'probe') {
  const a = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const R = c.getBoundingClientRect()
    const d = c._dbg
    return { x: R.x + d.probe.x, y: R.y + d.probe.y }
  })
  await dragInCanvas({ x: a.x, y: a.y }, { x: a.x + 120, y: a.y + 40 })
}
if (MODE === 'plateout') {
  await clickArea('step3'); await sleep(700)
  const a = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const R = c.getBoundingClientRect()
    const d = c._dbg
    return { x: R.x + d.probe.x, y: R.y + d.probe.y }
  })
  await dragInCanvas({ x: a.x, y: a.y }, { x: a.x + 40, y: a.y + 190 })
}
if (MODE === 'diy4') {
  await clickText('自己动手')
  await sleep(900)
  await clickArea('preset:dipole')
  await sleep(700)
  const cpos = await page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect()
    return { x: r.x + 458, y: r.y + 357 }
  })
  await page.mouse.click(cpos.x, cpos.y)
  await sleep(500)
  await setSlider('diyQ', 0.9)
  await sleep(600)
}
if (MODE === 'diy2' || MODE === 'diy3') {
  await clickText('自己动手')
  await sleep(900)
  if (MODE === 'diy2') await clickArea('preset:dipole')
  else await clickArea('preset:quad')
  await sleep(800)
}
if (MODE === 'diy1') {
  await clickText('自己动手')
  await sleep(900)
  await clickArea('diyPart:pos')
  const c = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width * 0.45, y: r.y + r.height * 0.45 } })
  await page.mouse.click(c.x, c.y)
  await sleep(500)
  await clickArea('diyPart:neg')
  await page.mouse.click(c.x - 120, c.y)
  await sleep(700)
}
await sleep(800)
await page.screenshot({ path: OUT })
const dbg = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c && c._dbg ? c._dbg : null
})
console.log('dbg:', JSON.stringify(dbg).slice(0, 900))
console.log('saved:', OUT)
await browser.close()
