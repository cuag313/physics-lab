/**
 * 探针：自己动手「点两个接线柱就连线」是否生效（手工放电源 + 小灯泡，点柱连线）
 */
import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = 1366, H = 768
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: [`--window-size=${W},${H}`, '--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)) })

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
async function click(name) {
  const a = await areaRect(name)
  if (!a) { console.log('!! miss', name); return false }
  await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2)
  await sleep(400)
  return true
}
// 世界坐标 → 屏幕坐标
async function termScreen(compIdx, port) {
  return page.evaluate((i, p) => {
    const c = document.querySelector('canvas')
    const v = c._diyView
    const r = c.getBoundingClientRect()
    const TERM = { battery: 28.6, bulb: 37.6, switch: 32.7, coil: 54 }
    const comp = (c._dbg.diyCompList || [])[i]
    if (!comp || !v) return null
    const wx = comp.x + (p === 0 ? -1 : 1) * (TERM[comp.type] || 26) * v.k
    return { x: r.x + v.ox + wx * v.sc, y: r.y + v.oy + comp.y * v.sc, type: comp.type }
  }, compIdx, port)
}
async function placeAt(type, fx, fy) {
  await click(`diyPart:${type}`)
  const stage = await areaRect('diyStage')
  await page.mouse.click(stage.x + stage.w * fx, stage.y + stage.h * fy)
  await sleep(500)
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学'); await sleep(900)
await clickText('自感与互感', true); await sleep(1600)
await clickText('动手'); await sleep(800)
await click('diyClear')

// 需要 _dbgComps 暴露器材坐标（调试用）
const hasComps = await page.evaluate(() => !!(document.querySelector('canvas')._dbg.diyCompList))
console.log('dbgComps available:', hasComps)

await placeAt('battery', 0.22, 0.62)
await placeAt('bulb', 0.72, 0.62)
await page.screenshot({ path: '_selfind-wire-0.png' })
console.log('after place:', JSON.stringify(await page.evaluate(() => {
  const c = document.querySelector('canvas'); const v = c._diyView
  return { view: v, comps: (c._dbg.diyCompList || []).map((x) => ({ t: x.type, x: Math.round(x.x), y: Math.round(x.y) })) }
})))

const t1 = await termScreen(0, 0)   // 电源左柱
const t2 = await termScreen(1, 0)   // 小灯泡左柱
console.log('terms:', t1, t2)
if (t1 && t2) {
  await page.mouse.click(t1.x, t1.y); await sleep(350)
  await page.screenshot({ path: '_selfind-wire-1.png' })
  await page.mouse.click(t2.x, t2.y); await sleep(500)
}
await page.screenshot({ path: '_selfind-wire-2.png' })
console.log('wires:', await page.evaluate(() => document.querySelector('canvas')._dbg.diyWires))
await browser.close()
console.log('done')
