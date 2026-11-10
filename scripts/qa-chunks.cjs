/**
 * 首屏网络嗅探：打开目录页，记录实际被下载的 JS chunk。
 * 用途：确认 three / 各实验 chunk 是否真的按需加载。
 */
const puppeteer = require('puppeteer-core')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.QA_URL || 'http://127.0.0.1:4173/physics-lab/'

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

  const js = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.endsWith('.js')) js.push(u.split('/assets/')[1] || u)
  })

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  const firstPaint = [...js]

  // 进入一个 2D 实验（电学 · 欧姆定律）
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await new Promise((r) => setTimeout(r, 400))
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.catalog-shell div')]
    const card = cards.find((d) => {
      const t = d.innerText || ''
      return t.includes('欧姆') && t.includes('点击进入实验') && t.length < 300
    })
    if (card) card.click()
  })
  await new Promise((r) => setTimeout(r, 2500))
  const after2D = [...js]

  // 返回目录，再进 3D 实验
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('div')].find((d) => (d.innerText || '').trim() === '← 返回目录')
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.catalog-shell div')]
    const card = cards.find((d) => {
      const t = d.innerText || ''
      return t.includes('3D') && t.includes('点击进入实验') && t.length < 300
    })
    if (card) card.click()
  })
  await new Promise((r) => setTimeout(r, 3000))
  const after3D = [...js]

  const diff = (a, b) => b.filter((x) => !a.includes(x))
  console.log(
    JSON.stringify(
      {
        firstPaint,
        firstPaintCount: firstPaint.length,
        newOn2D: diff(firstPaint, after2D),
        newOn3D: diff(after2D, after3D),
      },
      null,
      2
    )
  )
  await browser.close()
}
main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
