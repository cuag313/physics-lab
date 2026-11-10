const puppeteer = require('puppeteer-core')
const path = require('path')
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

  // 添加万用表（DOM 按钮）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('万用表'))
    if (b) b.click()
  })
  await sleep(600)

  const c = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })

  // 万用表 onAdd 放在画布 0.35w, 0.4h
  const mx = c.x + c.w * 0.35
  const my = c.y + c.h * 0.4

  // 读 LCD 区域像素无法直接读 canvas 内容，改读组件坐标附近是否有 grab 光标/拖动
  const before = await page.evaluate(() => document.body.innerText.includes('DCA') || document.body.innerText.includes('DCV'))

  // 点表身
  await page.mouse.click(mx, my)
  await sleep(400)
  await page.screenshot({ path: 'audit/t3-multimeter/09-tap-body-1.png' })

  // 再点
  await page.mouse.click(mx, my)
  await sleep(400)
  await page.screenshot({ path: 'audit/t3-multimeter/10-tap-body-2.png' })

  // 拖表身
  await page.mouse.move(mx, my)
  await page.mouse.down()
  await page.mouse.move(mx + 120, my + 40, { steps: 10 })
  await page.mouse.up()
  await sleep(400)
  await page.screenshot({ path: 'audit/t3-multimeter/11-drag-body.png' })

  // 点左侧接线柱（应进入连线，不是切档）
  const termX = mx - 40
  await page.mouse.click(termX, my)
  await sleep(300)
  await page.screenshot({ path: 'audit/t3-multimeter/12-click-terminal.png' })

  console.log(JSON.stringify({ canvas: c, bodyTextHasMode: before, note: 'check screenshots 09-12' }))
  await browser.close()
}
main().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
