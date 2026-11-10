const puppeteer = require('puppeteer-core')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function main() {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox','--disable-gpu'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto('http://127.0.0.1:5173/physics-lab/', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(500)
  console.log('flags', JSON.stringify(await page.evaluate(() => ({
    force: document.documentElement.classList.contains('force-landscape'),
    dpr: window.devicePixelRatio,
  }))))
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find(x => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await sleep(300)
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const t = d.innerText || ''
      if (t.includes('探究电流与电压、电阻的关系') && t.includes('点击进入实验') && t.length < 280) {
        if (!best || t.length < (best.innerText||'').length) best = d
      }
    }
    if (best) best.click()
  })
  await sleep(1200)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.scene-tab')].find(e => e.innerText.includes('自己动手'))
    if (el) el.click()
  })
  await sleep(400)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('万用表'))
    if (b) b.click()
  })
  await sleep(600)
  console.log('canvas', JSON.stringify(await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { force: document.documentElement.classList.contains('force-landscape'), rect: {x:r.x,y:r.y,w:r.width,h:r.height}, attr: {w:cv.width,h:cv.height} }
  })))
  await browser.close()
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
