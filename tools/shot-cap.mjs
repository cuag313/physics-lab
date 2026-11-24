/**
 * 截图工具：「电容器充放电」
 * 用法：node tools/shot-cap.mjs [宽] [高] [输出] [模式]
 *   模式：step1 | c1 | d2 | c2 | step3 | g3 | diy | diyrun | diyopen
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const OUT = process.argv[4] || `shot-cap-${W}x${H}.png`
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
  for (let i = 0; i < 4; i++) {
    const a = await areaRect(name)
    if (a) {
      await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2)
      await sleep(600)
      return true
    }
    await sleep(400)
  }
  console.log('miss area:', name)
  return false
}
async function dragArea(name, dx, dy) {
  const a = await areaRect(name)
  if (!a) { console.log('miss drag:', name); return false }
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.w / 2 + dx, a.y + a.h / 2 + dy, { steps: 10 })
  await page.mouse.up()
  await sleep(500)
  return true
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学')
await sleep(900)
await clickText('电容器充放电', { exact: true })
await sleep(2400)

if (MODE === 'c1') { await clickArea('switchBtn'); await sleep(1200) }
if (MODE === 'c1full') { await clickArea('switchBtn'); await sleep(6500) }
if (MODE === 'c2done') { await clickArea('step2'); await sleep(300); await clickArea('switchBtn'); await sleep(6800) }
if (MODE === 'd2' || MODE === 'c2') {
  await clickArea('step2')
  await sleep(400)
  if (MODE === 'c2') { await clickArea('switchBtn'); await sleep(1200) }
}
if (MODE === 'step3' || MODE === 'g3') {
  await clickArea('step3'); await sleep(300)
  await clickArea('switchBtn'); await sleep(900)
  if (MODE === 'g3') {
    await clickArea('ghostSave'); await sleep(300)
    await dragArea('rSlider', 100, 0)
    await clickArea('ghostSave'); await sleep(300)
    await dragArea('cSlider', -100, 0)
    await sleep(1600)
  }
}
if (MODE === 'diy' || MODE === 'diyrun' || MODE === 'diyopen') {
  await clickText('自己动手')
  await sleep(900)
  await clickArea('diyStandard')
  await sleep(700)
  if (MODE === 'diyrun') { await clickArea('diySwitch'); await sleep(1500) }
  if (MODE === 'diyopen') { await clickArea('diySwitch'); await sleep(300); await clickArea('diySwitch'); await sleep(300) }
}
await sleep(700)
await page.screenshot({ path: OUT })
const dbg = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c || !c._dbg) return null
  const d = c._dbg
  const bb = c.getBoundingClientRect()
  return { step: d.step, tab: d.tab, t: d.t, info: d.info, diy: d.diy, cw: Math.round(bb.width), ch: Math.round(bb.height), cy: Math.round(bb.top), areas: d.areas }
})
console.log('dbg:', JSON.stringify(dbg))
console.log('saved:', OUT)
await browser.close()
