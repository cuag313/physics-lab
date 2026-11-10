/**
 * T3 万用表交互验收（puppeteer-core + Edge）
 * 目标：ohmsLaw《探究电流与电压、电阻的关系》Tab2 自己动手
 * 检查：1) V/A 档切换 2) V 档串联报错 3) 未连线不阻塞 4) 与 CircuitGraph 规则一致
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.SHOT_URL || 'http://127.0.0.1:5173/physics-lab/'
const OUT = path.join(__dirname, '..', 'audit', 't3-multimeter')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openByName(page, name) {
  await page.evaluate((n) => {
    const all = [...document.querySelectorAll('div,button,a')]
    let best = null
    for (const d of all) {
      const t = (d.innerText || '').trim()
      if (t.includes(n) && t.includes('点击进入实验') && t.length < 280) {
        if (!best || t.length < (best.innerText || '').length) best = d
      }
    }
    if (!best) throw new Error('card not found: ' + n)
    best.click()
  }, name)
  await sleep(1500)
}

async function clickText(page, selector, text) {
  const ok = await page.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.innerText || '').includes(t))
    if (!el) return false
    el.click()
    return true
  }, selector, text)
  if (!ok) throw new Error(`element not found: ${selector} ~ ${text}`)
  await sleep(400)
}

function save(page, name) {
  return page.screenshot({ path: path.join(OUT, name), fullPage: false }).then(() => name)
}

async function canvasInfo(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { w: r.width, h: r.height, x: r.x, y: r.y, W: c.width, H: c.height }
  })
}

async function pageState(page, tag) {
  return page.evaluate((tag) => {
    const text = document.body.innerText
    return {
      tag,
      title: (text.match(/探[^\n|]{0,30}/) || [])[0] || null,
      tab: /自己动手/.test(text) ? (text.includes('点底部器材') || text.includes('操作说明') ? 'tab2' : 'tab1-or-2') : 'unknown',
      hasMultimeterBtn: [...document.querySelectorAll('button')].some((b) => b.innerText.includes('万用表')),
      hasHint: /拖器材到画布|轻点万用表|表笔/.test(text),
      modeLabel: (text.match(/万用表·(电流档|电压档)/) || [])[1] || null,
      probeHint: (text.match(/两点电压已显示|把红黑表笔|松手：万用表|红黑表笔分别|V \/ A|切换 V\/A/) || [])[0] || null,
      errorHint: (text.match(/伏特表串联|应并联|安培表并联|未连接|断路|短路/) || [])[0] || null,
      guide: (text.match(/拖器材到画布[^|]{0,40}/) || [])[0] || null,
      textHead: text.split('\n').filter(Boolean).slice(0, 18).join(' | ').slice(0, 260),
    }
  }, tag)
}

async function tapCanvas(page, c, fx, fy) {
  await page.mouse.click(c.x + c.w * fx, c.y + c.h * fy)
  await sleep(350)
}

async function dragCanvas(page, c, from, to, steps = 12) {
  const p0 = { x: c.x + c.w * from[0], y: c.y + c.h * from[1] }
  const p1 = { x: c.x + c.w * to[0], y: c.y + c.h * to[1] }
  await page.mouse.move(p0.x, p0.y)
  await page.mouse.down()
  for (let s = 1; s <= steps; s++) {
    await page.mouse.move(p0.x + (p1.x - p0.x) * s / steps, p0.y + (p1.y - p0.y) * s / steps)
  }
  await page.mouse.up()
  await sleep(350)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(600)
  await save(page, '01-catalog.png')

  await clickText(page, '.category-tab', '电学')
  // 精确实验名，避免命中「闭合电路欧姆定律」
  await openByName(page, '探究电流与电压、电阻的关系')
  await save(page, '02-ohmslaw-demo.png')
  let st = await pageState(page, 'tab1-demo')
  console.log('STATE tab1', JSON.stringify(st, null, 2))

  // Tab2 自己动手（SceneShell 的 .scene-tab）
  await clickText(page, '.scene-tab', '自己动手')
  await sleep(500)
  await save(page, '03-tab2-builder.png')
  st = await pageState(page, 'tab2-builder')
  console.log('STATE tab2', JSON.stringify(st, null, 2))

  // 点「万用表」加入画布（BuilderPalette 真实 button）
  await clickText(page, 'button', '万用表')
  await sleep(500)
  await save(page, '04-multimeter-added.png')
  st = await pageState(page, 'multimeter-added')
  console.log('STATE added', JSON.stringify(st, null, 2))

  const c = await canvasInfo(page)
  console.log('CANVAS', JSON.stringify(c))

  // 未连线时：应不阻塞（validate 不因万用表失败）
  // 搭最小回路：电源 → 灯泡（用器材按钮再添加）
  await clickText(page, 'button', '电源')
  await sleep(200)
  await clickText(page, 'button', '灯泡')
  await sleep(300)
  await save(page, '05-with-battery-bulb.png')
  st = await pageState(page, 'with-battery-bulb')
  console.log('STATE components', JSON.stringify(st, null, 2))

  // 轻点万用表机身切换 V/A（按放置坐标：画布 0.35/0.4 附近）
  // 先点几次看 modeLabel 是否出现/翻转
  for (let i = 0; i < 3; i++) {
    await tapCanvas(page, c, 0.38, 0.45)
    st = await pageState(page, `tap-${i + 1}`)
    console.log(`STATE tap${i + 1}`, JSON.stringify(st, null, 2))
  }
  await save(page, '06-after-mode-taps.png')

  // 尝试拖红表笔到画布中部（探针交互）
  await dragCanvas(page, c, [0.38, 0.50], [0.55, 0.40])
  st = await pageState(page, 'probe-drag')
  console.log('STATE probe', JSON.stringify(st, null, 2))
  await save(page, '07-probe-drag.png')

  // 拖万用表到电源/灯泡附近，便于后续连线目视
  await dragCanvas(page, c, [0.38, 0.45], [0.62, 0.35])
  await save(page, '08-multimeter-moved.png')
  st = await pageState(page, 'moved')
  console.log('STATE moved', JSON.stringify(st, null, 2))

  console.log('ERRORS', JSON.stringify(errors, null, 2))
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ errors, last: st }, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
