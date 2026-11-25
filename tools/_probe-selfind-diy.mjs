/**
 * 截图/探针：「自感与互感」自己动手（Tab2）
 * 用法：node tools/_probe-selfind-diy.mjs [宽] [高] [模式]
 *   模式：diy | diybuild | diyrun | diycolor | all
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const MODE = process.argv[4] || 'all'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new',
  args: [`--window-size=${W},${H}`, '--no-sandbox', '--disable-gpu-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)) })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

async function clickText(text, exact = false) {
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
  if (!a) { console.log('!! 找不到区域', name); return false }
  await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2)
  await sleep(500)
  return true
}
const dbg = () => page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (!c || !c._dbg) return null
  const d = c._dbg
  return { tab: d.tab, diyT: d.diyT, diyDbg: d.diyDbg, comps: d.diyComps, wires: d.diyWires }
})
async function shot(name) {
  await page.screenshot({ path: name })
  console.log('saved', name, JSON.stringify(await dbg()))
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(800)
await clickText('电学'); await sleep(900)
await clickText('自感与互感', true); await sleep(1600)
await clickText('动手'); await sleep(900)
console.log('入口 dbg =', JSON.stringify(await dbg()))

if (MODE === 'diy' || MODE === 'all') {
  await shot(`_selfind-diy-${W}x${H}.png`)
}
if (MODE === 'diybuild' || MODE === 'all') {
  await clickArea('diyClear'); await sleep(200)
  await clickArea('diyStandard'); await sleep(700)
  await shot(`_selfind-diybuild-${W}x${H}.png`)
}
if (MODE === 'diyrun' || MODE === 'all') {
  if (MODE === 'diyrun') { await clickArea('diyClear'); await clickArea('diyStandard'); await sleep(600); console.log('build dbg', JSON.stringify(await dbg())) }
  await clickArea('diySwitch'); await sleep(1200)
  await shot(`_selfind-diyrun-${W}x${H}.png`)
  await sleep(1500)
  await shot(`_selfind-diyfull-${W}x${H}.png`)
}
if (MODE === 'diycolor' || MODE === 'all') {
  await clickArea('diyWireColor3'); await sleep(200)
  await clickArea('diyClear'); await sleep(200)
  await clickArea('diyStandard'); await sleep(700)
  await shot(`_selfind-diycolor-${W}x${H}.png`)
}
// 断开一次（看断电提示与亮度归零）
if (MODE === 'diyopen') {
  await clickArea('diySwitch'); await sleep(600)
  await shot(`_selfind-diyopen-${W}x${H}.png`)
}
await browser.close()
console.log('done')
