const fs = require('fs')
const p = require('puppeteer-core')

async function main() {
  const out = 'D:/PythonProject/physics-lab/audit/qa-tab2'
  fs.mkdirSync(out, { recursive: true })
  const b = await p.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const pg = await b.newPage()
  const errors = []
  pg.on('pageerror', e => errors.push('pageerror: ' + String(e.message).slice(0, 140)))
  pg.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 140)) })
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
  // 切到 Tab2
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('.scene-tab')].find(e => e.innerText.includes('自己动手'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 800))

  const results = []
  const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? '✅' : '❌'} ${n}${d ? '  ' + d : ''}`) }

  // 注入一个灯泡 + 一个电阻（放画布中央，便于右键）
  const comp = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const s = cv._S.current
    s.components = []
    s.wires = []
    s.nextId = 1
    const bulb = { id: s.nextId++, type: 'bulb', x: 420, y: 300, rotation: 0, closed: true, props: { resistance: 10, ratedV: 2.5 } }
    const res = { id: s.nextId++, type: 'resistor', x: 620, y: 300, rotation: 0, closed: true, props: { resistance: 10 } }
    s.components.push(bulb, res)
    s._rev = (s._rev || 0) + 1
    return { x: bulb.x, y: bulb.y, id: bulb.id }
  })
  await new Promise(r => setTimeout(r, 700))
  await pg.screenshot({ path: `${out}/01-tab2-bench.png` })

  // 1) 右键元件 → 应弹出菜单
  const rect = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { x: r.x, y: r.y }
  })
  await pg.mouse.click(rect.x + comp.x, rect.y + comp.y, { button: 'right' })
  await new Promise(r => setTimeout(r, 500))
  const menuText = await pg.evaluate(() => document.body.innerText)
  ok('右键弹出菜单', menuText.includes('拆开看内部结构') && menuText.includes('复制元件') && menuText.includes('删除元件'))
  await pg.screenshot({ path: `${out}/02-context-menu.png` })

  // 2) 点「拆开看内部结构」→ 弹出剖视图面板
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('拆开看内部结构'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 900))
  const panelText = await pg.evaluate(() => document.body.innerText)
  ok('拆开面板弹出', panelText.includes('拆开看内部结构'), panelText.includes('玻璃') || panelText.includes('灯丝') ? '含部件图注' : '（图注待查）')
  await pg.screenshot({ path: `${out}/03-internal-bulb.png` })

  // 3) 剖视图 canvas 是否真的画了东西（非空白）
  const drawn = await pg.evaluate(() => {
    const cvs = [...document.querySelectorAll('canvas')]
    // 取最小的那块（浮层里的 320x250）
    const target = cvs.find(c => c.width <= 800 && c.height <= 700 && c.getBoundingClientRect().width <= 340)
    if (!target) return { found: false }
    const ctx = target.getContext('2d')
    const d = ctx.getImageData(0, 0, target.width, target.height).data
    let dark = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 20 && (d[i] + d[i + 1] + d[i + 2]) < 620) dark++
    }
    return { found: true, w: target.width, h: target.height, darkPx: dark }
  })
  ok('剖视图已绘制', drawn.found && drawn.darkPx > 400, JSON.stringify(drawn))

  // 4) 关闭面板，右键另一个元件（电阻）看剖视图
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '✕')
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await pg.mouse.click(rect.x + 620, rect.y + 300, { button: 'right' })
  await new Promise(r => setTimeout(r, 450))
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('拆开看内部结构'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 900))
  await pg.screenshot({ path: `${out}/04-internal-resistor.png` })
  const resPanel = await pg.evaluate(() => document.body.innerText)
  ok('定值电阻剖视图', resPanel.includes('定值电阻') || resPanel.includes('电阻'))

  // 5) 右键菜单的复制/删除
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === '✕')
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 350))
  const before = await pg.evaluate(() => document.querySelector('canvas')._S.current.components.length)
  await pg.mouse.click(rect.x + 420, rect.y + 300, { button: 'right' })
  await new Promise(r => setTimeout(r, 450))
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('复制元件'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 500))
  const afterCopy = await pg.evaluate(() => document.querySelector('canvas')._S.current.components.length)
  ok('复制元件', afterCopy === before + 1, `${before} → ${afterCopy}`)

  // 6) 撤销（应退回复制前）
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('撤销'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 500))
  const afterUndo = await pg.evaluate(() => document.querySelector('canvas')._S.current.components.length)
  ok('撤销还原', afterUndo === before, `${afterCopy} → ${afterUndo}`)

  // 7) 删除元件
  await pg.mouse.click(rect.x + 620, rect.y + 300, { button: 'right' })
  await new Promise(r => setTimeout(r, 450))
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('删除元件'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 500))
  const afterDel = await pg.evaluate(() => document.querySelector('canvas')._S.current.components.length)
  ok('右键删除元件', afterDel === before - 1, `${before} → ${afterDel}`)

  // 8) 工具栏按钮存在
  const toolbar = await pg.evaluate(() => document.body.innerText)
  ok('工具栏含撤销/清空桌面/保存/导出电路图/仿真启停',
    ['撤销', '清空桌面', '保存', '导出电路图'].every(k => toolbar.includes(k)) && (toolbar.includes('仿真：暂停') || toolbar.includes('仿真：运行')))

  // 9) 仿真启停
  await pg.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(b => b.innerText.includes('仿真：'))
    if (el) el.click()
  })
  await new Promise(r => setTimeout(r, 400))
  const paused = await pg.evaluate(() => document.querySelector('canvas')._S.current.paused)
  ok('仿真启停可切换', paused === true, `paused=${paused}`)

  console.log('\nerrors:', errors.length ? errors : '(none)')
  const fails = results.filter(r => !r.pass)
  console.log(`\n=== Tab2 QA: ${results.length - fails.length} 通过, ${fails.length} 失败 ===`)
  await b.close()
  if (fails.length) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
