const fs = require('fs')
const p = require('puppeteer-core')

const TYPES = [
  ['bulb', '小灯泡'], ['resistor', '定值电阻'], ['rheostat', '滑动变阻器'],
  ['ammeter', '电流表'], ['voltmeter', '电压表'], ['battery', '干电池'],
  ['switch', '单刀开关'], ['multimeter', '万用表'],
]

async function main() {
  const out = 'D:/PythonProject/physics-lab/audit/qa-tab2/internals'
  fs.mkdirSync(out, { recursive: true })
  const b = await p.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true, args: ['--no-sandbox', '--disable-gpu'],
  })
  const pg = await b.newPage()
  const errors = []
  pg.on('pageerror', e => errors.push('pageerror: ' + String(e.message).slice(0, 120)))
  pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)) })
  await pg.setViewport({ width: 1366, height: 860 })
  await pg.goto('http://localhost:4174/physics-lab/', { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 600))
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find(x => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await pg.evaluate(() => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const tx = d.innerText || ''
      if (tx.includes('探究电流与电压、电阻的关系') && tx.includes('点击进入实验') && tx.length < 280) {
        if (!best || tx.length < (best.innerText || '').length) best = d
      }
    }
    if (best) best.click()
  })
  await new Promise(r => setTimeout(r, 1800))
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('.scene-tab')].find(e => e.innerText.includes('自己动手'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 800))

  const results = []
  let i = 0
  for (const [type, name] of TYPES) {
    i++
    // 注入该类型元件到画布中央
    const pos = await pg.evaluate((t) => {
      const cv = document.querySelector('canvas')
      const s = cv._S.current
      s.components = [{ id: 1, type: t, x: 520, y: 330, rotation: 0, closed: true, props: {} }]
      s.wires = []
      s.nextId = 2
      s._rev = (s._rev || 0) + 1
      return { x: 520, y: 330 }
    }, type)
    await new Promise(r => setTimeout(r, 550))
    const rect = await pg.evaluate(() => {
      const r = document.querySelector('canvas').getBoundingClientRect()
      return { x: r.x, y: r.y }
    })
    await pg.mouse.click(rect.x + pos.x, rect.y + pos.y, { button: 'right' })
    await new Promise(r => setTimeout(r, 420))
    await pg.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('拆开看内部结构'))
      if (el) el.click()
    })
    await new Promise(r => setTimeout(r, 950))
    await pg.screenshot({ path: `${out}/${String(i).padStart(2, '0')}-${type}.png` })

    const st = await pg.evaluate(() => {
      const body = document.body.innerText
      const cvs = [...document.querySelectorAll('canvas')]
      const target = cvs.find(c => c.getBoundingClientRect().width <= 340 && c.getBoundingClientRect().width > 100)
      if (!target) return { panel: body.includes('拆开看内部结构'), dark: 0, labels: 0, legend: 0 }
      const ctx = target.getContext('2d')
      const d = ctx.getImageData(0, 0, target.width, target.height).data
      let dark = 0
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] > 20 && (d[k] + d[k + 1] + d[k + 2]) < 620) dark++
      }
      // 图注条数：面板右侧的小色块数
      const legend = document.querySelectorAll('div > span').length
      return { panel: body.includes('拆开看内部结构'), dark, legend }
    })
    const pass = st.panel && st.dark > 300
    results.push({ type, pass, dark: st.dark })
    console.log(`${pass ? '✅' : '❌'} ${name} (${type})  墨迹=${st.dark}`)
    // 关闭面板
    await pg.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '✕')
      if (el) el.click()
    })
    await new Promise(r => setTimeout(r, 320))
  }

  console.log('\nerrors:', errors.length ? errors : '(none)')
  const fails = results.filter(r => !r.pass)
  console.log(`\n=== 剖视图 QA: ${results.length - fails.length}/8 通过 ===`)
  await b.close()
  if (fails.length) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
