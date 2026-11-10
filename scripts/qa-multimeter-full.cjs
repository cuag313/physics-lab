const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://127.0.0.1:5173/physics-lab/'
const OUT = path.join(__dirname, '..', 'audit', 't3-multimeter')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function clickText(page, sel, text) {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.innerText || '').includes(t))
    if (!el) return false
    el.click(); return true
  }, sel, text)
  if (!ok) throw new Error('not found ' + sel + ' ' + text)
  await sleep(350)
}

async function canvasBox(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, W: cv.width, H: cv.height }
  })
}

async function sampleRegion(page, c, fx, fy, tag) {
  return page.evaluate((c, fx, fy, tag) => {
    const cv = document.querySelector('canvas')
    const ctx = cv.getContext('2d')
    const sx = cv.width / c.w, sy = cv.height / c.h
    const cx = c.w * fx * sx, cy = c.h * fy * sy
    let orange = 0, blue = 0, dark = 0, white = 0, red = 0
    for (let y = cy - 40; y < cy + 40; y += 2) {
      for (let x = cx - 50; x < cx + 50; x += 2) {
        const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
        const [r, g, b] = d
        if (r > 200 && g > 100 && g < 180 && b < 80) orange++
        if (r < 100 && g > 100 && b > 160) blue++
        if (r < 70 && g < 70 && b < 70) dark++
        if (r > 230 && g > 230 && b > 220) white++
        if (r > 180 && g < 90 && b < 90) red++
      }
    }
    return { tag, orange, blue, dark, white, red }
  }, c, fx, fy, tag)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(500)

  await clickText(page, '.category-tab', '电学')
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const t = d.innerText || ''
      if (t.includes('探究电流与电压、电阻的关系') && t.includes('点击进入实验') && t.length < 280) {
        if (!best || t.length < (best.innerText || '').length) best = d
      }
    }
    if (best) best.click()
  })
  await sleep(1500)
  await clickText(page, '.scene-tab', '自己动手')
  await clickText(page, 'button', '万用表')
  await sleep(700)

  let c = await canvasBox(page)
  const mx = c.x + c.w * 0.35
  const my = c.y + c.h * 0.4

  // 1) 初始外观
  await page.screenshot({ path: path.join(OUT, 'T1-initial.png') })
  let s1 = await sampleRegion(page, c, 0.35, 0.4, 'initial')
  console.log('T1 initial', JSON.stringify(s1))

  // 2) 点 V 按钮（机身左中）和 A 按钮（右中）
  // 机身局部 V: x=-38..-2, y=10..28；A: x=2..38, y=10..28
  // 未旋转时 world ≈ comp + local
  await page.mouse.click(mx - 20, my + 19) // V
  await sleep(300)
  await page.screenshot({ path: path.join(OUT, 'T2-click-V.png') })
  let s2 = await sampleRegion(page, c, 0.35, 0.4, 'after-V')

  await page.mouse.click(mx + 20, my + 19) // A
  await sleep(300)
  await page.screenshot({ path: path.join(OUT, 'T3-click-A.png') })
  let s3 = await sampleRegion(page, c, 0.35, 0.4, 'after-A')
  console.log('T2 V', JSON.stringify(s2))
  console.log('T3 A', JSON.stringify(s3))

  // 3) 拖表身
  await page.mouse.move(mx, my - 5)
  await page.mouse.down()
  await page.mouse.move(mx + 140, my + 50, { steps: 12 })
  await page.mouse.up()
  await sleep(400)
  await page.screenshot({ path: path.join(OUT, 'T4-drag-body.png') })
  const c2 = await canvasBox(page)
  let s4 = await sampleRegion(page, c2, (0.35 * c.w + 140) / c.w, (0.4 * c.h + 50) / c.h, 'after-drag')
  console.log('T4 drag', JSON.stringify(s4))

  // 4) 拖红表笔（复位位置：插孔下方）
  // 表笔复位约 comp.y+36+62
  const probeY = my + 50 + 36 + 62
  const probeRX = mx + 140 - 30
  await page.mouse.move(probeRX, probeY)
  await page.mouse.down()
  await page.mouse.move(probeRX + 80, probeY - 40, { steps: 10 })
  await page.mouse.up()
  await sleep(400)
  await page.screenshot({ path: path.join(OUT, 'T5-drag-probe.png') })

  // 5) 加电源+灯泡+开关，搭简单回路，再测表笔读数
  await clickText(page, 'button', '电源')
  await sleep(200)
  await clickText(page, 'button', '灯泡')
  await sleep(200)
  await clickText(page, 'button', '开关')
  await sleep(300)
  await page.screenshot({ path: path.join(OUT, 'T6-with-parts.png') })

  // 6) 点 V/A 切换后的光标/说明文案
  const textState = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      hasGuide: /拖器材|表笔|轻点万用表/.test(t),
      status: (t.match(/[✅❌][^\n]{0,40}/) || [])[0] || null,
      head: t.split('\n').filter(Boolean).slice(0, 20).join(' | ').slice(0, 240),
    }
  })
  console.log('TEXT', JSON.stringify(textState))
  console.log('ERRORS', JSON.stringify(errors))
  fs.writeFileSync(path.join(OUT, 'interactive-report.json'), JSON.stringify({ s1, s2, s3, s4, textState, errors }, null, 2))
  await browser.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
