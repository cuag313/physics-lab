/**
 * 临时验收脚本：在「自己动手」画布上放入干电池组与滑动变阻器并截图
 * 用法：node tools/shot-cap-parts.mjs [宽] [高] [输出]
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const OUT = process.argv[4] || 'shot-cap-parts.png'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--no-sandbox', '--disable-gpu-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
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

async function canvasOrigin() {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y }
  })
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
  await sleep(350)
  return true
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学')
await sleep(900)
await clickText('电容器充放电', { exact: true })
await sleep(2200)
await clickText('自己动手')
await sleep(900)

const o = await canvasOrigin()
await clickArea('diyPart:cell')
await page.mouse.click(o.x + 300, o.y + 250)
await sleep(350)
await clickArea('diyPart:rheostat')
await page.mouse.click(o.x + 820, o.y + 250)
await sleep(350)
// 选中变阻器 → 参数面板出现滑片滑条
await page.mouse.click(o.x + 820, o.y + 205)
await sleep(400)

// 连线：干电池组右柱 → 滑动变阻器左柱（检查导线是否落在柱帽中心）
const sc = 1.077
const cellR = { x: o.x + 14 + (266 + 48 * 1.7) * sc, y: o.y + 56 + 180 * sc }
const rheoL = { x: o.x + 14 + (749 - 54.7 * 1.7) * sc, y: o.y + 56 + 180 * sc }
await page.mouse.click(cellR.x, cellR.y)
await sleep(200)
await page.mouse.click(rheoL.x, rheoL.y)
await sleep(400)
// 拖动变阻器滑片到 25% 位置，检查接入电阻与标注同步
const sl = await areaRect('diyParam')
if (sl) {
  await page.mouse.click(sl.x + sl.w * 0.25, sl.y + sl.h / 2)
  await sleep(500)
  await page.screenshot({ path: OUT.replace(/\.png$/, '-slide.png') })
  console.log('slider ok')
}

await page.screenshot({ path: OUT })
// 再选中干电池组，检查参数区文案不与提示框打架
await page.mouse.click(o.x + 300, o.y + 250)
await sleep(300)
await page.screenshot({ path: OUT.replace(/\.png$/, '-cell.png') })
await page.screenshot({
  path: OUT.replace(/\.png$/, '-zoom.png'),
  clip: { x: Math.min(cellR.x, rheoL.x) - 60, y: cellR.y - 90, width: rheoL.x - cellR.x + 130, height: 190 },
})
const dbg = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const d = c._dbg
  return { diy: d.diy, areas: d.areas.map((a) => a.n) }
})
console.log('dbg:', JSON.stringify(dbg))
console.log('saved:', OUT)
await browser.close()
