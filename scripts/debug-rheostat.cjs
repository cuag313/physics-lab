/**
 * 验证 Tab1 物理读数：闭合后 I≈3/(R灯+R滑)
 */
const p = require('puppeteer-core')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.SHOT_URL || 'http://localhost:4174/physics-lab/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const b = await p.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const pg = await b.newPage()
  await pg.setViewport({ width: 1366, height: 860 })
  await pg.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(500)
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find(x => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await sleep(400)
  await pg.evaluate(() => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const tx = d.innerText || ''
      if (tx.includes('练习使用滑动变阻器') && tx.includes('点击进入实验') && tx.length < 280) {
        if (!best || tx.length < (best.innerText || '').length) best = d
      }
    }
    if (best) best.click()
    else throw new Error('not found')
  })
  await sleep(1800)

  // 读画布像素找读数芯片不现实 — 直接点开关后截图，并用 OCR 读数字
  const sw = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => !x.kind && x.h >= 40 && x.h <= 56)
    return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2 } : null
  })
  if (sw) await pg.mouse.click(sw.x, sw.y)
  await sleep(800)
  await pg.screenshot({ path: 'D:/PythonProject/physics-lab/audit/qa-practice-rheostat/physics-check.png' })

  // 拖滑片到中间
  const sl = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => x.kind === 'rheoSlider')
    return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2 } : null
  })
  if (sl) {
    await pg.mouse.move(sl.x, sl.y)
    await pg.mouse.down()
    await pg.mouse.move(sl.x - 25, sl.y, { steps: 6 })
    await pg.mouse.up()
    await sleep(600)
    await pg.screenshot({ path: 'D:/PythonProject/physics-lab/audit/qa-practice-rheostat/physics-mid.png' })
  }
  await b.close()
  console.log('screenshots saved')
}

main().catch(e => { console.error(e); process.exit(1) })
