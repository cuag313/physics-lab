/**
 * 临时验收脚本：两盒干电池串联 + 小灯泡 + 电容器，检查电压叠加（应为 6 V）
 * 用法：node tools/shot-cap-loop.mjs
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = process.argv[2] || 'shot-cap-loop.png'

const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new',
  args: ['--window-size=1366,768', '--no-sandbox', '--disable-gpu-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })
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
  await sleep(200)
  return true
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学')
await sleep(900)
await clickText('电容器充放电', true)
await sleep(2200)
await clickText('自己动手')
await sleep(900)

const info = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const r = c.getBoundingClientRect()
  const d = c._dbg
  return { ox: r.x, oy: r.y, areas: d.areas }
})
async function clickArea(name) {
  const a = info.areas.find((x) => x.n === name)
  if (!a) { console.log('miss', name); return }
  await page.mouse.click(info.ox + a.x + a.w / 2, info.oy + a.y + a.h / 2)
  await sleep(300)
}
const SC = 1.077, ORG = { x: 14, y: 56 }
const scr = (pt) => ({ x: info.ox + ORG.x + pt.x * SC, y: info.oy + ORG.y + pt.y * SC })
const TERM = { cell: 46.3, resistor: 37.6, capacitor: 26 }
const DY = 1.7
const term = (comp, i) => ({ x: comp.x + (i ? 1 : -1) * TERM[comp.type] * DY, y: comp.y })

const P = {
  a: { x: 210, y: 120, type: 'cell' },
  b: { x: 210, y: 360, type: 'cell' },
  bulb: { x: 690, y: 120, type: 'resistor' },
  cap: { x: 780, y: 380, type: 'capacitor' },
  spare: { x: 420, y: 560, type: 'cell' },
}
for (const k of ['a', 'b', 'bulb', 'cap']) {
  const t = k === 'a' || k === 'b' ? 'cell' : k === 'bulb' ? 'resistor' : 'capacitor'
  await clickArea('diyPart:' + t)
  await page.mouse.click(scr(P[k]).x, scr(P[k]).y)
  await sleep(300)
}
// 台上多放一盒没接线的干电池：不应计入 U
await clickArea('diyPart:cell')
await page.mouse.click(scr(P.spare).x, scr(P.spare).y)
await sleep(300)

const wire = async (a, b) => {
  const p1 = scr(term(a.c, a.i)), p2 = scr(term(b.c, b.i))
  await page.mouse.click(p1.x, p1.y); await sleep(180)
  await page.mouse.click(p2.x, p2.y); await sleep(350)
}
await wire({ c: P.a, i: 1 }, { c: P.b, i: 0 })     // 串联
await wire({ c: P.b, i: 1 }, { c: P.bulb, i: 0 })
await wire({ c: P.bulb, i: 1 }, { c: P.cap, i: 1 })
await wire({ c: P.cap, i: 0 }, { c: P.a, i: 0 })
await sleep(1800)
await page.screenshot({ path: OUT })
const dbg = await page.evaluate(() => {
  const d = document.querySelector('canvas')._dbg
  return { comps: d.diy.comps, wires: d.diy.wires }
})
console.log('dbg:', JSON.stringify(dbg))
console.log('saved:', OUT)
await browser.close()
