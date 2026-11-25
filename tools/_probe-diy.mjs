/**
 * 探针：验证「自己动手」页 ① 只有黑柄能开合闸刀 ② 点两个接线柱即接线
 * 用法：node tools/_probe-diy.mjs [宽] [高]
 */
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const W = Number(process.argv[2] || 1366)
const H = Number(process.argv[3] || 768)
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await puppeteer.launch({
  executablePath: EXE, headless: 'new',
  args: [`--window-size=${W},${H}`, '--no-sandbox', '--disable-gpu-sandbox'],
})
const page = await browser.newPage()
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })

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
const state = () => page.evaluate(() => {
  const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
  const d = c._dbg
  return { rect: { x: r.x, y: r.y }, K: d.diy.K, view: d.view, comps: d.diy.comps, wires: d.diy.wires, closed: d.diy.closed, grips: d.grips }
})

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
await sleep(900)
await clickText('电学'); await sleep(900)
await clickText('电容器充放电', true); await sleep(2400)
await clickText('自己动手'); await sleep(900)

const std = await page.evaluate(() => {
  const c = document.querySelector('canvas'); const r = c.getBoundingClientRect()
  const a = c._dbg.areas.find((x) => x.n === 'diyStandard')
  return { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2 }
})
await page.mouse.click(std.x, std.y); await sleep(800)

const st0 = await state()
const { rect, K, view } = st0
console.log('K =', K, 'view =', JSON.stringify(view), 'grips =', JSON.stringify(st0.grips))
const S = (wx, wy) => ({ x: rect.x + view.ox + wx * view.sc, y: rect.y + view.oy + wy * view.sc })
const comps = st0.comps.map((s) => { const [t, xy] = s.split('@'); const [x, y] = xy.split(',').map(Number); return { t, x, y } })
const sw = comps.find((c) => c.t === 'switch')
const bat = comps.find((c) => c.t === 'battery')
const rs = comps.find((c) => c.t === 'resistor')
const cap = comps.find((c) => c.t === 'capacitor')
const TAB = { battery: 28.6, switch: 32.7, resistor: 37.6, capacitor: 26, cell: 48, rheostat: 54.7 }
const term = (c, i) => S(c.x + (i ? 1 : -1) * TAB[c.t] * K, c.y)
const grip = () => (st0.grips || [])[0] || null

async function click1(wx, wy, tag) {
  const p = S(wx, wy)
  await page.mouse.click(p.x, p.y); await sleep(320)
  console.log(`单击 ${tag}: closed=`, JSON.stringify((await state()).closed))
}

// ① 点底座 / 刀身中部：不应开合（只选中）
await click1(sw.x, sw.y - 6, '底座中心')
await click1(sw.x - 6, sw.y - 55, '刀身中部')
async function tapGrip(tag) {
  const g = (await state()).grips[0]
  if (!g) { console.log('!! 没有 grips 数据'); return null }
  const gx = (g[0] + g[2]) / 2, gy = (g[1] + g[3]) / 2
  const p = S(gx, gy)
  await page.mouse.click(p.x, p.y); await sleep(320)
  console.log(`单击黑柄 ${tag}: 柄框=${JSON.stringify(g)} closed=`, JSON.stringify((await state()).closed))
  return { x: p.x, y: p.y }
}

// ② 点黑柄：每次都要按「当前」柄的位置点（开/合时柄的位置不同，正合物理直觉）
await tapGrip('闭合')
await tapGrip('断开')
// 快速连点两下（同一位置、间隔 55ms）：净效果只应翻转一次
const cur = (await state()).grips[0]
const p = S((cur[0] + cur[2]) / 2, (cur[1] + cur[3]) / 2)
const c0 = (await state()).closed
await page.mouse.click(p.x, p.y); await sleep(55)
await page.mouse.click(p.x, p.y); await sleep(400)
console.log('柄上快速连点两下:', JSON.stringify(c0), '->', JSON.stringify((await state()).closed))

// ③ 接线：电源左柱 → 灯泡右柱
const before = (await state()).wires
const p1 = term(bat, 0), p2 = term(rs, 1)
await page.mouse.click(p1.x, p1.y); await sleep(250)
await page.mouse.click(p2.x, p2.y); await sleep(500)
console.log(`接线 电源左柱→灯泡右柱: ${before} -> ${(await state()).wires}`)

// ④ 接线时点开关本体中间：应吸附到最近的柱（并选中），不会误开合
const b2 = (await state()).wires
const c2 = (await state()).closed
const q1 = term(bat, 1)
await page.mouse.click(q1.x, q1.y); await sleep(250)
const mid = S(sw.x, sw.y - 6)
await page.mouse.click(mid.x, mid.y); await sleep(500)
const after2 = await state()
console.log(`接线 电源右柱→点开关本体: wires ${b2} -> ${after2.wires}, closed 不变?`, JSON.stringify(c2) === JSON.stringify(after2.closed))

// ⑤ 开、合两态各截一张（选中态，看金色柄框是否落在黑柄上）
async function shotAt(closedWanted, name) {
  const st = await state()
  const isClosed = st.closed.some(Boolean)
  if (isClosed !== closedWanted) {
    const gg = (await state()).grips[0]
    const p = S((gg[0] + gg[2]) / 2, (gg[1] + gg[3]) / 2)
    await page.mouse.click(p.x, p.y); await sleep(400)
  }
  await page.screenshot({ path: `_probe-diy-${name}-${W}x${H}.png` })
  console.log(`saved ${name}`, JSON.stringify((await state()).closed))
}
await shotAt(true, 'closed')
await shotAt(false, 'open')
console.log('saved')
await browser.close()
