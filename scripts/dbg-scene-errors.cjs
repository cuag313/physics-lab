/* 诊断电学 SVG 场景：进场 → 示例电路 → 打印报错与关键节点数量
 * 用法：node scripts/dbg-scene-errors.cjs
 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: 'new',
    args: ['--window-size=1680,1000', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1680, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)) })
  await page.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(800)
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await sleep(500)
  const entered = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const tx = d.innerText || ''
      if (tx.includes('电学虚拟实验室') && tx.includes('点击进入实验') && tx.length < 260) {
        if (!best || tx.length < (best.innerText || '').length) best = d
      }
    }
    if (best) { best.click(); return true }
    return false
  })
  await sleep(1500)
  const demo = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.btn,button')].find((x) => (x.innerText || '').includes('示例电路'))
    if (b) { b.click(); return true }
    return false
  })
  await sleep(1200)
  const stats = await page.evaluate(() => ({
    comps: document.querySelectorAll('.esvg-comp').length,
    wires: document.querySelectorAll('.esvg-wirelayer > g').length,
    wrap: document.querySelectorAll('.esvg-wirelayer ellipse').length,
    canvas: !!document.querySelector('.esvg-canvas'),
    text: (document.body.innerText || '').slice(0, 160).replace(/\n/g, ' | '),
  }))
  console.log('entered:', entered, 'demoClicked:', demo)
  console.log('stats:', JSON.stringify(stats))
  console.log('errors:', errors.length ? errors.slice(0, 6) : '(none)')
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
