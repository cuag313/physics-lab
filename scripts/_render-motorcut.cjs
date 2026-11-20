/* 渲染 3D 电动机本体 → 透明底 PNG（Tab2 剖面图用）
 * 用法：node scripts/_render-motorcut.cjs
 * 走临时入口 poster.html（不经过场景、不叠页头），430×364 @dpr3 → 1290×1092
 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://127.0.0.1:5199/physics-lab/poster.html'

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })
  await p.setViewport({ width: 900, height: 800, deviceScaleFactor: 2 })
  await p.goto(URL, { waitUntil: 'networkidle2' })
  await sleep(2200)
  const info = await p.evaluate(() => {
    const c = document.querySelector('canvas')
    const r = c ? c.getBoundingClientRect() : null
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height, sw: c.width, sh: c.height } : null
  })
  console.log('canvas', JSON.stringify(info))
  await p.screenshot({ path: 'audit/fidelity/poster-cut.png', omitBackground: true, clip: { x: 0, y: 0, width: 384, height: 325 } })
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
