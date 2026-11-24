/**
 * 交互验收：进入「电磁感应（法拉第实验）」，拖导体棒，看电流/指针是否响应。
 * 用法：node tools/test-induction.mjs
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const W = 1366
const H = 768

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--no-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200))
})

async function clickText(text, { exact = false } = {}) {
  const pos = await page.evaluate(
    (txt, isExact) => {
      const els = [...document.querySelectorAll('body *')].filter((n) => {
        const own = (n.textContent || '').trim()
        if (!own || n.children.length > 3) return false
        return isExact ? own === txt : own.startsWith(txt)
      })
      const el = els[els.length - 1]
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    },
    text,
    exact,
  )
  if (!pos) return false
  await page.mouse.click(pos.x, pos.y)
  return true
}

const rect = async () => { const r = await page.evaluate(() => { const c = document.querySelector("canvas"); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y }; }); return r }
const dbg = () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas')
    return c && c._dbg ? JSON.parse(JSON.stringify(c._dbg)) : null
  })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学')
await sleep(800)
await clickText('电磁感应（法拉第实验）', { exact: true })
await sleep(1800)

let d = await dbg()
console.log('初始:', JSON.stringify(d))
const R = await rect()

// 拖导体棒：从棒中点往右拉 80px
const mid = { x: R.x + (d.rodA.x + d.rodB.x) / 2, y: R.y + (d.rodA.y + d.rodB.y) / 2 }
await page.mouse.move(mid.x, mid.y)
await page.mouse.down()
let iMax = 0
for (let k = 1; k <= 10; k++) {
  await page.mouse.move(mid.x - k * 9, mid.y - k * 1.6)
  await sleep(35)
  d = await dbg()
  iMax = Math.max(iMax, Math.abs(d.i))
}
// 最后一次带速度的移动后立刻截屏，看指针是否偏出去
await page.mouse.move(mid.x - 40, mid.y - 7)
await sleep(45)
await page.screenshot({ path: 'shot-induction-drag.png' })
d = await dbg()
console.log('拖动中:', JSON.stringify({ iMax, i: d.i, dragging: d.dragging, auto: d.auto, shift: d.shift }))
await page.mouse.up()
await sleep(300)

// 停住后看指针是否回零
await sleep(1200)
d = await dbg()
console.log('松手后:', JSON.stringify({ i: d.i, dragging: d.dragging, auto: d.auto }))

// 直接点控件热区（_dbg.areas：[0]=滑条 [1]=自动/停住 [2]=记录 [3]=归零；「磁场」按钮已去掉）
const clickArea = async (idx) => {
  const a = d.areas[idx]
  await page.mouse.click(R.x + a.x + a.w / 2, R.y + a.y + a.h / 2)
  await sleep(500)
  d = await dbg()
}

await clickArea(1)
console.log('点停住:', JSON.stringify({ auto: d.auto }))
await clickArea(2)
console.log('点记录:', JSON.stringify({ recN: d.recN }))
await clickArea(3)
console.log('点归零:', JSON.stringify({ recN: d.recN, auto: d.auto, nAreas: d.areas.length }))

await page.screenshot({ path: 'shot-induction-after.png' })
console.log('done')
await browser.close()



