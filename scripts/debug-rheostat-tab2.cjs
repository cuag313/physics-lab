/**
 * Tab2 接线冒烟：加电池+开关+滑变+灯泡+电流表，按 一上一下 接成串联回路
 */
const p = require('puppeteer-core')
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.SHOT_URL || 'http://localhost:4174/physics-lab/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const b = await p.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  const pg = await b.newPage()
  const errors = []
  pg.on('pageerror', e => errors.push(String(e.message).slice(0, 160)))
  pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
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
  await sleep(1600)

  // 切 Tab2
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.scene-tab')].find(x => x.innerText.includes('自己动手'))
    if (t) t.click()
  })
  await sleep(500)

  // 添加元件（每次添加后 dragId 会吸附，需点空白取消再加下一个）
  for (const name of ['干电池组', '开关', '滑动变阻器', '标准灯泡', '标准电流表']) {
    await pg.evaluate((n) => {
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes(n))
      if (btn) btn.click()
    }, name)
    await sleep(200)
    // 点画布空白释放 dragId
    await pg.mouse.click(200, 200)
    await sleep(80)
  }

  // 读桌面状态（通过工具栏 tag）
  let tag = await pg.evaluate(() => {
    return [...document.querySelectorAll('span')].map(s => s.innerText).find(t => t && t.includes('元件')) || ''
  })
  console.log('after add:', tag)

  // 用内部 API 不可得 —— 通过双击看读数 / 右键删，再截图
  await pg.screenshot({ path: 'D:/PythonProject/physics-lab/audit/qa-practice-rheostat/tab2-wired-attempt.png' })

  // 尝试从 canvas 像素找接线柱亮点较难；改为验证双击读数卡
  // 双击画布中部
  await pg.mouse.click(400, 350)
  await sleep(80)
  await pg.mouse.click(400, 350)
  await sleep(400)
  await pg.screenshot({ path: 'D:/PythonProject/physics-lab/audit/qa-practice-rheostat/tab2-dblclick.png' })

  console.log('errors:', errors.length ? errors : '(none)')
  await b.close()
}

main().catch(e => { console.error(e); process.exit(1) })
