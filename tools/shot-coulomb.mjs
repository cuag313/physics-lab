/**
 * 截图工具：「库仑定律探究」（悬线偏角法）
 * 用法：node tools/shot-coulomb.mjs [宽] [高] [输出文件] [模式]
 *   模式：step1(默认) | step2 | step3 | step4 | compare | neg | real | close
 *        diy1 | diy2 | diy3 | diy4 | diy5（自己动手：空装配 / 装 3 件 / 装齐 / 测量记录 / 作图弹窗）
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const OUT = process.argv[4] || `shot-coulomb-${W}x${H}.png`
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

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学')
await sleep(900)
await clickText('库仑定律探究', { exact: true })
await sleep(2600)

if (MODE === 'step2') { await clickArea('step2'); await setSlider('rSlider', 0.12); await sleep(700) }
if (MODE === 'step3') { await clickArea('step3'); await setSlider('q1Slider', 1); await sleep(700) }
if (MODE === 'step4') { await clickArea('step4'); await sleep(700) }
if (MODE === 'neg') { await clickArea('bBall'); await sleep(700) }
if (MODE === 'compare') {
  await setSlider('rSlider', 0.10); await clickArea('saveBtn')
  await setSlider('rSlider', 0.35); await clickArea('saveBtn')
  await setSlider('rSlider', 0.60); await clickArea('saveBtn')
  await clickArea('compareBtn')
  await sleep(900)
}
if (MODE === 'real') { await clickArea('gainBtn'); await sleep(700) }
if (MODE === 'close') { await setSlider('rSlider', 0.02); await sleep(700) }

if (MODE.startsWith('diy')) {
  await clickText('自己动手')
  await sleep(900)
  if (MODE !== 'diy1') {
    for (const t of ['rig', 'A', 'B']) { await clickArea(`diyPart:${t}`); await sleep(320) }
    if (MODE !== 'diy2') { await clickArea('diyPart:ruler'); await sleep(320) }
  }
  if (MODE === 'diy4' || MODE === 'diy5') {
    await clickArea('diyStart'); await sleep(800)
    for (const ratio of [0.05, 0.35, 0.8]) {
      await setSlider('diyR', ratio)
      await clickArea('diyRec')
      await sleep(420)
    }
    await sleep(500)
  }
  if (MODE === 'diy5') { await clickArea('diyGraph'); await sleep(900) }
}

await page.screenshot({ path: OUT })
const dbg = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c && c._dbg ? { step: c._dbg.step, rCm: c._dbg.rCm, theta: c._dbg.theta, records: c._dbg.records, compare: c._dbg.compare, diyStage: c._dbg.diyStage, diyPlaced: c._dbg.diyPlaced, diyPoints: c._dbg.diyPoints, graph: c._dbg.graph, areas: c._dbg.areas.map((a) => a.n).filter(Boolean) } : null
})
console.log('dbg:', JSON.stringify(dbg))
console.log('saved:', OUT)
await browser.close()
