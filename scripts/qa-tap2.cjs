const puppeteer = require('puppeteer-core')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://127.0.0.1:5173/physics-lab/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(500)
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await sleep(400)
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
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.scene-tab')].find((e) => e.innerText.includes('自己动手'))
    if (el) el.click()
  })
  await sleep(500)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('万用表'))
    if (b) b.click()
  })
  await sleep(600)

  // 在页面内画一个固定探针：抓 knob 指示色（V 黄 #ffd54f / A 橙 #ff8a65）
  const sample = async (tag) => {
    return page.evaluate((tag) => {
      const cv = document.querySelector('canvas')
      const ctx = cv.getContext('2d')
      const r = cv.getBoundingClientRect()
      // 组件放置点（CSS 像素）→ canvas 像素
      const sx = cv.width / r.width
      const sy = cv.height / r.height
      const cx = r.width * 0.35 * sx
      const cy = r.height * 0.4 * sy
      // 旋钮指示线大致在 (0, 14) 附近，采样 (6..12, 8..20) 区域里最饱和的黄/橙
      let yellow = 0, orange = 0, dark = 0
      for (let y = cy - 10; y < cy + 30; y += 2) {
        for (let x = cx - 30; x < cx + 30; x += 2) {
          const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data
          const [rr, gg, bb] = d
          if (rr > 180 && gg > 140 && bb < 120) yellow++
          if (rr > 200 && gg > 100 && gg < 160 && bb < 120) orange++
          if (rr < 80 && gg < 80 && bb < 80) dark++
        }
      }
      return { tag, yellow, orange, dark, cx: Math.round(cx), cy: Math.round(cy) }
    }, tag)
  }

  const s0 = await sample('after-add')
  const box = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const mx = box.x + box.w * 0.35
  const my = box.y + box.h * 0.4

  await page.mouse.click(mx, my)
  await sleep(350)
  const s1 = await sample('tap1')

  await page.mouse.click(mx, my)
  await sleep(350)
  const s2 = await sample('tap2')

  // 拖动后位置应变
  await page.mouse.move(mx, my)
  await page.mouse.down()
  await page.mouse.move(mx + 150, my + 60, { steps: 12 })
  await page.mouse.up()
  await sleep(400)
  const s3 = await sample('after-drag')
  await page.screenshot({ path: 'audit/t3-multimeter/13-after-fix-drag.png' })

  console.log(JSON.stringify({ s0, s1, s2, s3 }, null, 2))
  await browser.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
