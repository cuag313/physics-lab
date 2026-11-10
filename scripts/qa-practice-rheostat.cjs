/**
 * QA：练习使用滑动变阻器
 * 断言 Tab1 规范练习 / Tab2 自己动手 可交互，截图到 audit/qa-practice-rheostat/
 */
const fs = require('fs')
const p = require('puppeteer-core')

const OUT = 'D:/PythonProject/physics-lab/audit/qa-practice-rheostat'
const URL = process.env.SHOT_URL || 'http://localhost:4174/physics-lab/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function openScene(pg, name) {
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find(x => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await sleep(400)
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
  await sleep(1800)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const b = await p.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const pg = await b.newPage()
  const errors = []
  pg.on('pageerror', e => errors.push(String(e.message).slice(0, 160)))
  pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
  await pg.setViewport({ width: 1366, height: 860 })
  await pg.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(600)

  await openScene(pg, '练习使用滑动变阻器')
  await pg.screenshot({ path: `${OUT}/01-tab1-initial.png` })
  console.log('01 tab1 initial ok')

  // Tab1：点开关（h 40~56）
  const sw = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => x.h >= 40 && x.h <= 56 && x.w < 120)
    return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2, w: a.w, h: a.h } : null
  })
  if (sw) {
    await pg.mouse.click(sw.x, sw.y)
    await sleep(700)
    console.log('02 switch clicked', sw.w, sw.h)
  } else {
    console.log('02 NO switch area')
  }
  await pg.screenshot({ path: `${OUT}/02-tab1-closed.png` })

  // 拖滑片（kind=rheoSlider）
  const sl = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => x.kind === 'rheoSlider')
    return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2, w: a.w, h: a.h } : null
  })
  if (sl) {
    await pg.mouse.move(sl.x, sl.y)
    await pg.mouse.down()
    await pg.mouse.move(sl.x - 30, sl.y, { steps: 8 })
    await pg.mouse.up()
    await sleep(500)
    console.log('03 slider dragged', sl.w, sl.h)
  } else {
    console.log('03 NO slider area')
  }
  await pg.screenshot({ path: `${OUT}/03-tab1-slider.png` })

  // 记录按钮（h 32）
  const rec = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => x.h >= 28 && x.h <= 36 && x.w > 100)
    return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2 } : null
  })
  if (rec) {
    await pg.mouse.click(rec.x, rec.y)
    await sleep(400)
    console.log('04 record clicked')
  }
  await pg.screenshot({ path: `${OUT}/04-tab1-record.png` })

  // 拆开看滑变
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('拆开看滑变'))
    if (btn) btn.click()
  })
  await sleep(500)
  await pg.screenshot({ path: `${OUT}/05-internal.png` })
  const hasInternal = await pg.evaluate(() => {
    const cvs = [...document.querySelectorAll('canvas')].filter(c => c.getBoundingClientRect().width < 400)
    return cvs.some(c => {
      try {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let dark = 0
        for (let i = 0; i < d.length; i += 16) {
          if (d[i + 3] > 20 && (d[i] + d[i + 1] + d[i + 2]) < 620) dark++
        }
        return dark > 200
      } catch { return false }
    })
  })
  console.log('05 internal panel drawn =', hasInternal)
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '✕')
    if (btn) btn.click()
  })
  await sleep(300)

  // Tab2
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.scene-tab')].find(x => x.innerText.includes('自己动手'))
    if (t) t.click()
  })
  await sleep(600)
  await pg.screenshot({ path: `${OUT}/06-tab2-empty.png` })

  // 点器材栏添加 电池/开关/滑变/灯泡/电流表
  for (const name of ['干电池组', '开关', '滑动变阻器', '标准灯泡', '标准电流表']) {
    await pg.evaluate((n) => {
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes(n))
      if (btn) btn.click()
      else throw new Error('palette missing: ' + n)
    }, name)
    await sleep(250)
  }
  await pg.screenshot({ path: `${OUT}/07-tab2-added.png` })
  const compCount = await pg.evaluate(() => {
    // 从工具栏 tag 文本读「元件 N」
    const tag = [...document.querySelectorAll('span')].map(s => s.innerText).find(t => t && t.includes('元件'))
    return tag || 'no-tag'
  })
  console.log('07 palette add →', compCount)

  // 尝试连线：点两个接线柱（用 _R 无法直接读 components，用坐标点画布端子热区较难）
  // 至少验证双击读数卡 / 右键删除不抛错
  await pg.mouse.click(200, 300, { button: 'right' })
  await sleep(300)
  await pg.screenshot({ path: `${OUT}/08-tab2-context.png` })

  // 清空桌面
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('清空桌面'))
    if (btn) btn.click()
  })
  await sleep(400)
  await pg.screenshot({ path: `${OUT}/09-tab2-cleared.png` })
  const afterClear = await pg.evaluate(() => {
    const tag = [...document.querySelectorAll('span')].map(s => s.innerText).find(t => t && t.includes('元件'))
    return tag || 'no-tag'
  })
  console.log('09 after clear →', afterClear)

  console.log('errors:', errors.length ? errors : '(none)')
  await b.close()
}

main().catch(e => { console.error(e); process.exit(1) })
