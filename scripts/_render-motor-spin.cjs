/* Tab2「自己动手」小电动机卡的图：底图 + 24 帧转子层
 * 底图  motor_body.png   ← ?parts=stator（极靴/字母/电刷/底座/接线柱，不含线圈）
 * 转子  motor_r0..23.png ← ?parts=rotor&theta=0..345°（只有轴/单匝线圈/换向片）
 * 两层同窗口 392×331 @dpr2 → 784×662（卡 200×169，约 4 倍余量）
 * 用法：node scripts/_render-motor-spin.cjs
 */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = 'http://127.0.0.1:5199/physics-lab/poster-spin.html'
const OUT = 'public/assets/equipment/fig'
const N = 24
const W = 392
const H = 331

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console:' + m.text()) })
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 2 })

  const shot = async (url, file, wait) => {
    await p.goto(url, { waitUntil: 'networkidle2' })
    await sleep(wait)
    const ok = await p.evaluate(() => !!document.querySelector('canvas'))
    if (!ok) { console.log('no canvas', file); return }
    await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } })
    console.log('ok', file.split('/').pop())
  }

  await shot(`${BASE}?parts=stator&on=0`, `${OUT}/motor_body.png`, 2400)

  for (let i = 0; i < N; i++) {
    const deg = i * (360 / N)
    await shot(`${BASE}?parts=rotor&theta=${(deg * Math.PI) / 180}&on=1`, `${OUT}/motor_r${i}.png`, i === 0 ? 2200 : 900)
  }

  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
