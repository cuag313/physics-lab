const puppeteer = require('puppeteer-core')
const path = require('path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://localhost:5199/physics-lab/'
const OUT = path.join('D:', 'PythonProject', 'physics-lab', 'audit', 'fidelity')
const W = 1680, H = 1000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    defaultViewport: { width: W, height: H, deviceScaleFactor: 2 },
    args: ['--force-device-scale-factor=2'],
  })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1200)
  // 进「电功与电能表」
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.scene-card, .lab-card, a, button')]
    const hit = cards.find((x) => (x.innerText || '').includes('电功与电能表'))
    if (hit) hit.click()
  })
  await sleep(1200)
  await p.evaluate(() => {
    const t = [...document.querySelectorAll('.scene-tab')]
    if (t[1]) t[1].click()
  })
  await sleep(900)
  const addOne = async (name) => {
    await p.evaluate((n) => {
      const btn = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('title') || '').startsWith(`添加${n}（`))
      if (btn) btn.click()
      return !!btn
    }, name)
    await sleep(240)
  }
  for (const n of ['交流电源', '电能表', '空气开关', '两孔插座', '三孔插座', '洗衣机', '电饭煲', '电热水壶', '电暖器']) await addOne(n)

  const dump = () => p.evaluate(() => [...document.querySelectorAll('.esb-comp')].map((e, i) => {
    const r = e.getBoundingClientRect()
    const t = (e.innerText || '').replace(/\s+/g, ' ').slice(0, 14)
    return `${i} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} "${t}"`
  }))
  console.log('BEFORE', JSON.stringify(await dump(), null, 1))

  const cr = await p.evaluate(() => [...document.querySelectorAll('.esb-comp')].map((e) => {
    const r = e.getBoundingClientRect()
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  }))
  const dragTo = async (from, to) => {
    await p.mouse.move(from.cx, from.cy)
    await p.mouse.down()
    for (let k = 1; k <= 10; k++) {
      await p.mouse.move(from.cx + (to.cx - from.cx) * k / 10, from.cy + (to.cy - from.cy) * k / 10)
      await sleep(40)
    }
    await p.mouse.up()
    await sleep(350)
  }
  // 洗衣机在排序后的第 3 个（0 acSource 1 meter 2 breaker 3 washer 4 riceCooker 5 kettle 6 heater 7 socket2 8 socket3）
  await dragTo(cr[3], cr[7])
  await dragTo(cr[4], cr[8])
  await sleep(600)
  console.log('AFTER', JSON.stringify(await dump(), null, 1))
  const st = await p.evaluate(() => {
    const t = document.body.innerText
    return (t.match(/[✅⚠][^\n]{0,90}/g) || []).slice(0, 6)
  })
  console.log('STATUS', JSON.stringify(st))
  await p.screenshot({ path: `${OUT}/dbg-drag.png` })
  console.log('errors:', errors.length ? errors : '(none)')
  await b.close()
})()
