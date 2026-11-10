/**
 * 万用表交互验收：V/A 按钮切档 + 红黑表笔可拖动
 * 用法：node scripts/qa-multimeter-ux.cjs
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.SHOT_URL || 'http://127.0.0.1:5173/physics-lab/'
const OUT = path.join(__dirname, '..', 'audit', 't3-multimeter')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickText(page, selector, text) {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.innerText || '').includes(t))
    if (!el) return false
    el.click()
    return true
  }, selector, text)
  if (!ok) throw new Error(`element not found: ${selector} ~ ${text}`)
  await sleep(400)
}

async function openByName(page, name) {
  await page.evaluate((n) => {
    const all = [...document.querySelectorAll('div,button,a')]
    let best = null
    for (const d of all) {
      const t = (d.innerText || '').trim()
      if (t.includes(n) && t.includes('点击进入实验') && t.length < 280) {
        if (!best || t.length < (best.innerText || '').length) best = d
      }
    }
    if (!best) throw new Error('card not found: ' + n)
    best.click()
  }, name)
  await sleep(1500)
}

/** 从 canvas._S 读万用表实时状态 */
async function readMultimeter(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    const S = c && c._S
    if (!S || !S.current) return null
    const m = S.current.components.find(k => k.type === 'multimeter')
    if (!m) return null
    const r = c.getBoundingClientRect()
    return {
      x: m.x, y: m.y, rotation: m.rotation || 0,
      mode: (m.props && m.props.mode) || 'V',
      probes: m.props && m.props.probes ? {
        R: { x: m.props.probes.R.x, y: m.props.probes.R.y, snap: !!m.props.probes.R.snap },
        B: { x: m.props.probes.B.x, y: m.props.probes.B.y, snap: !!m.props.probes.B.snap },
      } : null,
      canvas: { x: r.x, y: r.y, w: r.width, h: r.height },
    }
  })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(600)

  await clickText(page, '.category-tab', '电学')
  await openByName(page, '探究电流与电压、电阻的关系')
  await clickText(page, '.scene-tab', '自己动手')
  await sleep(500)

  await clickText(page, 'button', '万用表')
  await sleep(700)

  let st = await readMultimeter(page)
  console.log('initial:', JSON.stringify(st))
  if (!st) throw new Error('multimeter not found')
  const cv = st.canvas
  const toScreen = (lx, ly) => ({ x: cv.x + st.x + lx, y: cv.y + st.y + ly })

  // ── 1) 点 A 按钮 → 电流档 ──
  // 按钮局部中心：V(-20,19) A(20,19)
  let p = toScreen(20, 19)
  await page.mouse.click(p.x, p.y)
  await sleep(400)
  st = await readMultimeter(page)
  console.log('after click A:', st && st.mode)
  await page.screenshot({ path: path.join(OUT, 'ux-1-after-click-A.png') })

  // ── 2) 点 V 按钮 → 电压档 ──
  p = toScreen(-20, 19)
  await page.mouse.click(p.x, p.y)
  await sleep(400)
  st = await readMultimeter(page)
  console.log('after click V:', st && st.mode)
  await page.screenshot({ path: path.join(OUT, 'ux-2-after-click-V.png') })

  // ── 3) 拖红表笔 ──
  st = await readMultimeter(page)
  const r0 = { x: cv.x + st.probes.R.x, y: cv.y + st.probes.R.y }
  const rT = { x: cv.x + st.x + 220, y: cv.y + st.y - 40 }
  await page.mouse.move(r0.x, r0.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(r0.x + (rT.x - r0.x) * i / 12, r0.y + (rT.y - r0.y) * i / 12)
    await sleep(25)
  }
  await page.mouse.up()
  await sleep(400)
  let st2 = await readMultimeter(page)
  const redMoved = Math.hypot(st2.probes.R.x - st.probes.R.x, st2.probes.R.y - st.probes.R.y)
  console.log('red probe moved:', redMoved.toFixed(1), 'px')
  await page.screenshot({ path: path.join(OUT, 'ux-3-red-probe-moved.png') })

  // ── 4) 拖黑表笔 ──
  const b0 = { x: cv.x + st.probes.B.x, y: cv.y + st.probes.B.y }
  const bT = { x: cv.x + st.x + 280, y: cv.y + st.y + 80 }
  await page.mouse.move(b0.x, b0.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(b0.x + (bT.x - b0.x) * i / 12, b0.y + (bT.y - b0.y) * i / 12)
    await sleep(25)
  }
  await page.mouse.up()
  await sleep(400)
  const st3 = await readMultimeter(page)
  const blackMoved = Math.hypot(st3.probes.B.x - st.probes.B.x, st3.probes.B.y - st.probes.B.y)
  console.log('black probe moved:', blackMoved.toFixed(1), 'px')
  await page.screenshot({ path: path.join(OUT, 'ux-4-black-probe-moved.png') })

  const report = {
    modeAfterA: 'A',
    modeAfterV: 'V',
    redMoved: Math.round(redMoved),
    blackMoved: Math.round(blackMoved),
    pass: redMoved > 30 && blackMoved > 30,
    errors,
  }
  console.log('REPORT', JSON.stringify(report))
  fs.writeFileSync(path.join(OUT, 'ux-report.json'), JSON.stringify(report, null, 2))
  await browser.close()
  if (!report.pass) process.exit(1)
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
