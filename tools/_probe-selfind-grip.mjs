/**
 * 探针：闸刀黑柄是否就是开合热点（一键标准电路后直接点黑柄）
 */
import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = 1366, H = 768
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await puppeteer.launch({ executablePath: EXE, headless: 'new', args: [`--window-size=${W},${H}`, '--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
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
async function click(name) {
  for (let i = 0; i < 8; i++) {
    const a = await areaRect(name)
    if (a) { await page.mouse.click(a.x + a.w / 2, a.y + a.h / 2); await sleep(500); return true }
    await sleep(350)
  }
  console.log('!! miss', name)
  return false
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学'); await sleep(1000)
console.log('scene click:', await clickText('自感与互感', true)); await sleep(2200)
console.log('canvas?', await page.evaluate(() => !!document.querySelector('canvas')))
console.log('tab click:', await clickText('动手')); await sleep(900)
await click('diyClear')
await click('diyStandard')
await sleep(800)

const grip = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const v = c._diyView
  const r = c.getBoundingClientRect()
  const sw = (c._dbg.diyCompList || []).find((x) => x.type === 'switch')
  if (!sw || !v) return null
  const term = 32.7, scale = (2 * term) / (151 - 26)
  const x0 = -term - 26 * scale, y0 = -82 * scale
  // 黑柄中心随刀绕铰链 (46.3,64.5) 旋转：合 0°，断 −27°（与场景里 swGripBox 同一口径）
  const th = (sw.closed ? 0 : -27) * Math.PI / 180
  const cos = Math.cos(th), sin = Math.sin(th)
  const gx = 152.5, gy = 64.5
  const dx = gx - 46.3, dy = gy - 64.5
  const rx = 46.3 + dx * cos - dy * sin
  const ry = 64.5 + dx * sin + dy * cos
  const lx = x0 + rx * scale, ly = y0 + ry * scale
  return { x: r.x + v.ox + (sw.x + lx * v.k) * v.sc, y: r.y + v.oy + (sw.y + ly * v.k) * v.sc }
})
const state = () => page.evaluate(() => (document.querySelector('canvas')._dbg.diyCompList.find((x) => x.type === 'switch') || {}).closed)
console.log('grip at', grip, 'closed before:', await state())
if (grip) { await page.mouse.click(grip.x, grip.y); await sleep(900) }
console.log('closed after grip click:', await state())
await page.screenshot({ path: '_selfind-grip.png' })
await browser.close()
console.log('done')
