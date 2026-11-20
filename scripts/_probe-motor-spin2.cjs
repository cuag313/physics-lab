/* 探针 2：定位那两个 motor_s*.png 的 <image> 各自挂在哪个容器上（HTML 卡 / React 运动层） */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 2 })
  await p.goto('http://127.0.0.1:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => { const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学')); if (e) e.click() })
  await sleep(600)
  await p.evaluate(() => { const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电动机原理'); if (d.length) d[d.length - 1].click() })
  await sleep(1400)
  await p.evaluate(() => { const t = [...document.querySelectorAll('.scene-tab')]; if (t[1]) t[1].click() })
  await sleep(900)
  for (const n of ['电池组', '开关', '小电动机']) {
    await p.evaluate((nn) => { const btn = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(nn)); if (btn) btn.click() }, n)
    await sleep(260)
  }
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return false
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    return true
  }, i)
  const termN = await p.evaluate(() => document.querySelectorAll('.esb-term').length)
  if (termN >= 6) { await clickTerm(1); await clickTerm(2); await clickTerm(3); await clickTerm(4); await clickTerm(5); await clickTerm(0) }
  await sleep(800)
  const dump = () => p.evaluate(() => [...document.querySelectorAll('image')]
    .filter((im) => (im.getAttribute('href') || '').includes('motor_s'))
    .map((im) => {
      const chain = []
      let e = im
      for (let k = 0; k < 4 && e; k++) { chain.push(e.nodeName + (e.getAttribute && e.getAttribute('class') ? '.' + e.getAttribute('class') : '')); e = e.parentElement }
      return (im.getAttribute('href') || '').split('/').pop() + ' < ' + chain.join(' < ')
    }))
  const info = await p.evaluate(() => {
    const ml = document.querySelector('.esb-motionlayer')
    return { nodes: ml ? ml.childElementCount : -1, kids: ml ? [...ml.children].map((k) => k.nodeName + ':' + (k.getAttribute('href') || '')) : [] }
  })
  console.log('motionlayer', JSON.stringify(info))
  console.log('t0', await dump())
  await sleep(1200)
  console.log('t1', await dump())
  await b.close()
})()


