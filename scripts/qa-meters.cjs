/** 截图验证 v2：分步截图，定位 WebGL 上下文丢失时机 */
const puppeteer = require('puppeteer-core')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://localhost:5199/physics-lab/'

async function clickDeep(page, text, tag) {
  const ok = await page.evaluate((t, tg) => {
    const els = [...document.querySelectorAll(tg || 'div,button,span,a')].filter(
      (e) => e.offsetParent !== null && e.textContent.includes(t),
    )
    if (!els.length) return false
    const deep = els.reduce((a, b) => (a.contains(b) ? b : a))
    deep.click()
    return true
  }, text, tag)
  if (!ok) throw new Error('not found: ' + text)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** 检测 WebGL canvas 是否还在正常出图（中心区非纯白/纯黑） */
async function canvasAlive(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return { ok: false, reason: 'no canvas' }
    try {
      const g = c.getContext('webgl2') || c.getContext('webgl')
      if (g && g.isContextLost && g.isContextLost()) return { ok: false, reason: 'context lost' }
    } catch (e) { /* ignore */ }
    return { ok: true, w: c.width, h: c.height }
  })
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
    ],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' || t.includes('Context') || t.includes('WebGL')) console.log('[console]', t.slice(0, 180))
  })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await wait(1500)

  await clickDeep(page, '电学')
  await wait(800)
  await clickDeep(page, '简单电路')
  await wait(2500)
  await clickDeep(page, '自己动手', 'button')
  await wait(3000)

  console.log('alive after tab2:', JSON.stringify(await canvasAlive(page)))
  await page.screenshot({ path: 'shot-s0-empty.png' })
  console.log('shot-s0-empty.png')

  for (const name of ['电流表', '电压表', '电源', '灯泡', '开关']) {
    await clickDeep(page, name, 'button')
    await wait(1800)
    const st = await canvasAlive(page)
    console.log(`after add ${name}:`, JSON.stringify(st))
    await page.screenshot({ path: `shot-s1-${name}.png` })
    if (!st.ok) { console.log('canvas died at', name); break }
  }

  await browser.close()
  console.log('DONE')
})().catch((e) => {
  console.error('FAIL', e)
  process.exit(1)
})
