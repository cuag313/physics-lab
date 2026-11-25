/**
 * 截图/探针：「自感与互感」
 * 用法：node tools/_probe-selfind.mjs [宽] [高] [模式]
 *   模式：s1 | s1closed | s2 | s2open | s3 | s4dc | s4 | s4hi | all
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
  await sleep(600)
  return true
}
const dbg = () => page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c && c._dbg ? { step: c._dbg.step, t: c._dbg.t, info: c._dbg.info, cardScroll: c._dbg.cardScroll, cardMax: c._dbg.cardMax, areas: c._dbg.areas.map((a) => a.n) } : null
})
async function shot(name) {
  await page.screenshot({ path: name })
  console.log('saved', name, JSON.stringify(await dbg()))
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(800)
await clickText('电学'); await sleep(900)
await clickText('自感与互感', true); await sleep(2000)
console.log('入口 dbg =', JSON.stringify(await dbg()))

if (MODE === 's1' || MODE === 'all') {
  await clickArea('step1'); await sleep(300)
  await shot(`_selfind-s1-${W}x${H}.png`)
}
if (MODE === 's1closed' || MODE === 'all') {
  await clickArea('step1'); await sleep(200)
  await clickArea('switchBtn'); await sleep(1200)
  await shot(`_selfind-s1closed-${W}x${H}.png`)
}
if (MODE === 's2' || MODE === 'all') {
  await clickArea('step2'); await sleep(300)
  await shot(`_selfind-s2-${W}x${H}.png`)
  await clickArea('switchBtn'); await sleep(700)
  await shot(`_selfind-s2open-${W}x${H}.png`)
}
if (MODE === 's3' || MODE === 'all') {
  await clickArea('step3'); await sleep(200)
  await clickArea('switchBtn'); await sleep(900)
  await shot(`_selfind-s3-${W}x${H}.png`)
}
if (MODE === 's4dc' || MODE === 'all') {
  await clickArea('step4'); await sleep(200)
  await clickArea('preset0'); await sleep(500)
  await shot(`_selfind-s4dc-${W}x${H}.png`)
}
if (MODE === 's4' || MODE === 'all') {
  await clickArea('step4'); await sleep(200)
  await clickArea('preset0'); await sleep(200)
  await clickArea('preset50'); await sleep(500)
  await shot(`_selfind-s4hi-${W}x${H}.png`)
}
if (MODE === 's5' || MODE === 'all') {
  await clickArea('step5'); await sleep(200)
  await shot(`_selfind-s5-${W}x${H}.png`)
}
if (MODE === 's5on' || MODE === 'all') {
  await clickArea('step5'); await sleep(200)
  await clickArea('switchBtn'); await sleep(120)
  await shot(`_selfind-s5on-${W}x${H}.png`)
}
if (MODE === 's5off' || MODE === 'all') {
  await clickArea('step5'); await sleep(200)
  await clickArea('switchBtn'); await sleep(2000)   // 合闸到稳态
  await clickArea('switchBtn'); await sleep(120)    // 断闸瞬间
  await shot(`_selfind-s5off-${W}x${H}.png`)
}
if (MODE === 's5scroll' || MODE === 'all') {
  await clickArea('step5'); await sleep(200)
  // 鼠标移到右侧应用卡片上，滚轮向下滚：验证大字号装不下时能滚动查看
  const cx = Math.round(W * 0.82), cy = Math.round(H * 0.70)
  await page.mouse.move(cx, cy)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: 60 }); await sleep(120) }
  await sleep(400)
  await shot(`_selfind-s5scroll-${W}x${H}.png`)
}
await browser.close()
console.log('done')
