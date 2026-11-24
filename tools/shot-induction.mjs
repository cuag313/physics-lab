/**
 * 截图工具：打开本地 dev 服务里的「电磁感应（法拉第实验）」并截屏。
 * 用法：node tools/shot-induction.mjs [宽] [高] [输出文件]
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const OUT = process.argv[4] || `shot-induction-${W}x${H}.png`
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const TITLE = process.argv[5] || '电磁感应（法拉第实验）'
const CAT = process.argv[6] || '电学'

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: 'new',
  args: [`--window-size=${W},${H}`, '--no-sandbox', '--disable-gpu-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error') console.log('[console]', t.slice(0, 300))
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))

/** 按可见文字点击（用真实鼠标事件，命中 React 的 onClick） */
async function clickText(text, { exact = false } = {}) {
  const pos = await page.evaluate(
    (txt, isExact) => {
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
    },
    text,
    exact,
  )
  if (!pos) return false
  await page.mouse.click(pos.x, pos.y)
  return true
}

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(1000)

const okCat = await clickText(CAT)
console.log('category:', okCat)
await sleep(900)

const okCard = await clickText(TITLE, { exact: true })
console.log('title:', okCard)
await sleep(2500)
if (process.argv[7] === 'tab2') {
  await clickText('自己动手')
  await sleep(1500)
}
if (process.argv[7] === 'tab2' && (process.argv[8] === 'bench' || process.argv[8] === 'wired')) {
  // 加两件摆件：蹄形磁铁 + 导体棒，看它们在桌面上的比例和透视
  await clickText('蹄形磁铁')
  await sleep(700)
  await clickText('导体棒')
  await sleep(900)
}
if (process.argv[8] === 'bench' && process.argv[9] === 'in') {
  // 把导体棒拖进两极的缝里，看"切割磁感线"的位置对不对
  const pts = await page.evaluate(() => {
    const find = (tag) =>
      [...document.querySelectorAll('div.esb-comp')].find((d) => d.innerHTML.includes(tag))
    const rg = find('cr-body')
    const mg = find('hm-nf')
    if (!rg || !mg) return null
    const rr = rg.getBoundingClientRect()
    const mr = mg.getBoundingClientRect()
    const sc = mr.width / 300
    return {
      from: { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2 },
      to: { x: mr.x + 116 * sc, y: mr.y + 208 * sc },
    }
  })
  if (pts) {
    await page.mouse.move(pts.from.x, pts.from.y)
    await page.mouse.down()
    await sleep(120)
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(
        pts.from.x + ((pts.to.x - pts.from.x) * i) / 12,
        pts.from.y + ((pts.to.y - pts.from.y) * i) / 12,
      )
      await sleep(35)
    }
    await page.mouse.up()
    await sleep(900)
    // 点空白处取消选中，别让删除按钮和虚线框留在截图里
    await page.mouse.click(760, 420)
    await sleep(700)
  }
}
if (process.argv[8] === 'wired') {
  /* 全套：磁铁 + 导体棒 + 灵敏电流计 → 棒拖进缝里 → A/B 两柱接到电流计 −/+ →
     再按住棒往右拖 40 px（截图就停在这一下，指针正在偏） */
  const rectOf = (type) => page.evaluate((tp) => {
    const d = document.querySelector(`div.esb-comp[data-comp-type="${tp}"]`)
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  }, type)
  const termPt = (title) => page.evaluate((tt) => {
    const d = [...document.querySelectorAll('div.esb-term')].find((x) => (x.getAttribute('title') || '').includes(tt))
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, title)
  await clickText('灵敏电流计')
  await sleep(800)
  /* 电流计挪到磁铁右下方：导线跨得短一点，弧才不会被拉成"从表背后甩出去"的大弯 */
  const gv = await rectOf('galvanometer')
  if (gv) {
    await page.mouse.move(gv.cx, gv.cy)
    await page.mouse.down()
    await sleep(80)
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(gv.cx + ((520 - gv.cx) * i) / 8, gv.cy + ((470 - gv.cy) * i) / 8)
      await sleep(25)
    }
    await page.mouse.up()
    await sleep(500)
  }
  const mr = await rectOf('horseshoeMagnet')
  const rr = await rectOf('conductorRod')
  if (mr && rr) {
    await page.mouse.move(rr.cx, rr.cy)
    await page.mouse.down()
    await sleep(100)
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(rr.cx + ((mr.x + 116 - rr.cx) * i) / 10, rr.cy + ((mr.y + 208 - rr.cy) * i) / 10)
      await sleep(30)
    }
    await page.mouse.up()
    await sleep(600)
  }
  for (const [a, b] of [['A 端接线柱', '黑柱'], ['B 端接线柱', '红柱']]) {
    const p1 = await termPt(a)
    const p2 = await termPt(b)
    if (!p1 || !p2) continue
    await page.mouse.click(p1.x, p1.y)
    await sleep(350)
    await page.mouse.click(p2.x, p2.y)
    await sleep(500)
  }
  const r2 = await rectOf('conductorRod')
  await page.mouse.move(r2.cx, r2.cy)
  await page.mouse.down()
  await sleep(80)
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(r2.cx + 5 * i, r2.cy)
    await sleep(28)
  }
  // 不松手 —— 截图停在"正在切割"的那一帧
}
if (process.argv[8] === 'flip') {
  // 点画布上的「磁场」按钮（areas[2]），看磁场反转（箭头朝上）的样子
  const hit = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const d = c && c._dbg
    if (!d || !d.areas || !d.areas[2]) return null
    const r = c.getBoundingClientRect()
    const a = d.areas[2]
    return { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2 }
  })
  if (hit) {
    await page.mouse.click(hit.x, hit.y)
    await sleep(1200)
  }
}

await page.screenshot({ path: OUT })
const dbg = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c && c._dbg ? c._dbg : null
})
console.log('dbg:', JSON.stringify(dbg))
console.log('saved:', OUT)
await browser.close()


