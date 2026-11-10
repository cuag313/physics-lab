// 伏安法实验 Tab2 写实器材截图验证
const fs = require('fs')
const p = require('puppeteer-core')

const BASE = 'http://localhost:4174/physics-lab/'

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
  await new Promise(r => setTimeout(r, 1500))
}

async function main() {
  const out = 'D:/PythonProject/physics-lab/audit/qa-voltampere'
  fs.mkdirSync(out, { recursive: true })
  const b = await p.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const pg = await b.newPage()
  const errors = []
  pg.on('pageerror', e => errors.push(String(e.message).slice(0, 160)))
  pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
  await pg.setViewport({ width: 1366, height: 860 })
  await pg.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 500))

  await openScene(pg, '伏安法测定值电阻')

  // 切到 Tab2「自己动手」
  await pg.evaluate(() => {
    const btn = [...document.querySelectorAll('button.scene-tab')].find(x => x.innerText.includes('自己动手'))
    if (btn) btn.click()
    else throw new Error('tab2 button not found')
  })
  await new Promise(r => setTimeout(r, 600))

  // 读取画布与器材栏热区
  const layout = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const pal = (cv._palAreas || []).filter(a => a.type).map(a => ({ type: a.type, x: a.x + a.w / 2, y: a.y + a.h / 2 }))
    return { r: { x: r.x, y: r.y, w: r.width, h: r.height }, pal }
  })
  console.log('palette:', JSON.stringify(layout.pal))

  // 拖放器材：在器材栏按下 → 拖到工作区分散位置 → 松开
  const targets = {
    battery: [320, 220], switch: [500, 220], rheostat: [320, 420],
    ammeter: [680, 220], bulb: [520, 430], resistor: [700, 430], voltmeter: [880, 320],
  }
  const byType = new Map(layout.pal.map(a => [a.type, a]))
  for (const [type, [tx, ty]] of Object.entries(targets)) {
    const src = byType.get(type)
    if (!src) { console.log('skip (not in palette):', type); continue }
    await pg.mouse.move(layout.r.x + src.x, layout.r.y + src.y)
    await pg.mouse.down()
    await new Promise(r => setTimeout(r, 60))
    await pg.mouse.move(layout.r.x + tx, layout.r.y + ty, { steps: 8 })
    await pg.mouse.up()
    await new Promise(r => setTimeout(r, 120))
  }

  await pg.screenshot({ path: `${out}/voltampere-tab2-components.png` })

  // 连线：电源(1)→开关(2)→A表→变阻→灯泡，V表并灯泡（简化：只连几条展示胶皮导线）
  // 直接读取组件坐标，找接线柱（±40 本地，旋转0）
  const comps = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    // 通过重绘后的 clickAreas 无法拿组件，改用拖拽后的视觉近似：这里返回空，改由脚本按 targets 计算
    return null
  })
  void comps

  console.log('errors:', errors.length ? errors : '(none)')
  await b.close()
}

main().catch(e => { console.error(e); process.exit(1) })
