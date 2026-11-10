const fs = require('fs')
const p = require('puppeteer-core')

const SCENES = process.argv.slice(2)

async function openScene(pg, name) {
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find(x => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await pg.evaluate((n) => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const tx = d.innerText || ''
      if (tx.includes(n) && tx.includes('点击进入实验') && tx.length < 280) {
        if (!best || tx.length < (best.innerText || '').length) best = d
      }
    }
    if (best) best.click()
    else throw new Error('not found: ' + n)
  }, name)
  await new Promise(r => setTimeout(r, 1800))
}

async function main() {
  const out = 'D:/PythonProject/physics-lab/audit/qa-electric'
  fs.mkdirSync(out, { recursive: true })
  const b = await p.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const pg = await b.newPage()
  const errors = []
  pg.on('pageerror', e => errors.push(String(e.message).slice(0, 140)))
  pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)) })
  await pg.setViewport({ width: 1366, height: 860 })
  await pg.goto('http://localhost:4174/physics-lab/', { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 600))

  for (const name of SCENES) {
    await pg.goto('http://localhost:4174/physics-lab/', { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise(r => setTimeout(r, 500))
    await openScene(pg, name)
    await pg.screenshot({ path: `${out}/${name}-off.png` })
    // 闭合开关（找开关点击区：h 约 44 或 50）
    const sw = await pg.evaluate(() => {
      const cv = document.querySelector('canvas')
      const r = cv.getBoundingClientRect()
      const a = (cv._clickAreas || []).find(x => x.h >= 40 && x.h <= 56 && x.w < 120)
      return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2, w: a.w, h: a.h } : null
    })
    if (sw) {
      await pg.mouse.click(sw.x, sw.y)
      await new Promise(r => setTimeout(r, 700))
    }
    await pg.screenshot({ path: `${out}/${name}-on.png` })
    console.log(name, sw ? `switch@${sw.w}x${sw.h}` : 'no switch area')
  }
  console.log('errors:', errors.length ? errors : '(none)')
  await b.close()
}

main().catch(e => { console.error(e); process.exit(1) })
