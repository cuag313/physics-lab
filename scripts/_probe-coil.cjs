/* 探针：小电动机线圈的 scale 动画到底有没有在走（取线圈组的 CTM.a 采样 12 次）
   node scripts\_probe-coil.cjs */
const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  await p.setViewport({ width: 1680, height: 1000, deviceScaleFactor: 1 })
  await p.goto('http://127.0.0.1:5199/physics-lab/', { waitUntil: 'networkidle2' })
  await sleep(900)
  await p.evaluate(() => {
    const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (e) e.click()
  })
  await sleep(600)
  await p.evaluate(() => {
    const d = [...document.querySelectorAll('div')].filter((x) => x.innerText.trim() === '电动机原理')
    if (d.length) d[d.length - 1].click()
  })
  await sleep(1400)
  const tabPt = await p.evaluate(() => {
    const box = [...document.querySelectorAll('.scene-tab')].find((x) => x.innerText.includes('自己动手'))
    if (!box) return null
    const r = box.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  if (tabPt) await p.mouse.click(tabPt.x, tabPt.y)
  await sleep(900)
  for (const n of ['电池组', '开关', '小电动机']) {
    await p.evaluate((nn) => {
      const btn = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(nn))
      if (btn) btn.click()
    }, n)
    await sleep(280)
  }
  const clickTerm = (i) => p.evaluate((idx) => {
    const el = [...document.querySelectorAll('.esb-term')][idx]
    if (!el) return false
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }))
    return true
  }, i)
  const termN = await p.evaluate(() => document.querySelectorAll('.esb-term').length)
  if (termN >= 6) {
    await clickTerm(1); await clickTerm(2)
    await clickTerm(3); await clickTerm(4)
    await clickTerm(5); await clickTerm(0)
  }
  await sleep(600)
  const swBox = await p.evaluate(() => {
    const list = [...document.querySelectorAll('.esb-comp')]
    const e = list[1]
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  if (swBox) await p.mouse.click(swBox.x + swBox.width / 2, swBox.y + swBox.height / 2)
  await sleep(500)

  const probe = () => p.evaluate(() => {
    const anims = [...document.querySelectorAll('animateTransform')]
    const info = anims.map((a) => {
      const g = a.parentElement
      const m = g.getCTM()
      return {
        type: a.getAttribute('type'),
        attr: a.getAttribute('attributeName'),
        dur: a.getAttribute('dur'),
        a: Number(m.a.toFixed(3)),
        d: Number(m.d.toFixed(3)),
        e: Number(m.e.toFixed(1)),
        href: g.parentElement ? g.parentElement.getAttribute('transform') : null,
      }
    })
    return info
  })
  const samples = []
  for (let i = 0; i < 12; i++) { samples.push(await probe()); await sleep(150) }
  console.log(JSON.stringify(samples.map((s) => s.map((x) => x.a)), null, 0))
  console.log('first:', JSON.stringify(samples[0]))
  await b.close()
})()
