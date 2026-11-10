#!/usr/bin/env node
/**
 * 3D 电学实验台（可动手沙盒）QA：
 * 加器材 → 接线柱拉线连接 → 开关通断 → 调变阻器 → 截图
 * 用法： node scripts/qa-lab3d.cjs
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'audit', 'lab3d')
const EDGE = process.env.SHOT_EDGE
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.SHOT_URL || 'http://localhost:4173/physics-lab/'

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function clickText(page, text) {
  return page.evaluate((t) => {
    const els = [...document.querySelectorAll('div')].filter((e) => (e.innerText || '').includes(t))
    let best = null
    for (const e of els) if (!best || (e.innerText || '').length < (best.innerText || '').length) best = e
    if (best) { best.click(); return true }
    return false
  }, text)
}

async function dragTerm(page, fromId, fromPort, toId, toPort) {
  const a = await page.evaluate((i, p) => window.__lab3dTermScreen && window.__lab3dTermScreen(i, p), fromId, fromPort)
  const b = await page.evaluate((i, p) => window.__lab3dTermScreen && window.__lab3dTermScreen(i, p), toId, toPort)
  if (!a || !b) return false
  const cam = await page.evaluate(() => window.__lab3dCam && window.__lab3dCam())
  const el = await page.evaluate((x, y) => {
    const e = document.elementFromPoint(x, y)
    return e ? e.tagName + '.' + (e.className || '').toString().slice(0, 30) : 'none'
  }, Math.round(a.x), Math.round(a.y))
  console.log('  cam', JSON.stringify(cam), 'down-on', el)
  console.log('  term screen', JSON.stringify(a), '->', JSON.stringify(b))
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10)
    await sleep(25)
  }
  await page.mouse.up()
  await sleep(300)
  return true
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--window-size=1600,1000', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1500)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (el) el.click()
  })
  await sleep(600)
  const ok = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div')]
    let best = null
    for (const d of all) {
      const t = d.innerText || ''
      if (t.includes('3D 电学实验台') && t.includes('点击进入实验') && t.length < 300) {
        if (!best || t.length < (best.innerText || '').length) best = d
      }
    }
    if (best) { best.click(); return true }
    return false
  })
  if (!ok) throw new Error('experiment not found')
  await sleep(3500)

  const shot = async (n) => { const f = path.join(OUT, n); await page.screenshot({ path: f }); console.log('shot', f) }

  // 1) 加 4 件器材
  for (const l of ['干电池组', '单刀开关', '小灯泡', '滑动变阻器']) {
    await clickText(page, l)
    await sleep(400)
  }
  const ids = await page.evaluate(() => {
    const st = window.__lab3dStore && window.__lab3dStore.getState()
    return st ? st.components.map((c) => ({ id: c.id, type: c.type })) : []
  })
  console.log('components:', JSON.stringify(ids))
  await shot('01-added.png')

  // 2) 接线：电池+ → 开关0、开关1 → 变阻器0、变阻器1 → 灯泡0、灯泡1 → 电池−
  const byType = (t) => (ids.find((c) => c.type === t) || {}).id
  const bat = byType('battery'), sw = byType('switch'), bulb = byType('bulb'), rheo = byType('rheostat')
  const pairs = [
    [bat, 1, sw, 0], [sw, 1, rheo, 0], [rheo, 1, bulb, 0], [bulb, 1, bat, 0],
  ]
  let wired = 0
  for (const [f, fp, t, tp] of pairs) {
    if (f == null || t == null) continue
    const okk = await dragTerm(page, f, fp, t, tp)
    console.log('pair', f + ':' + fp, '->', t + ':' + tp, okk ? 'attempted' : 'no-term')
    const wc = await page.evaluate(() => window.__lab3dStore.getState().wires.length)
    console.log('  wires now', wc)
    wired++
    await sleep(200)
  }
  const wireCount = await page.evaluate(() => {
    const st = window.__lab3dStore.getState()
    return st.wires.length
  })
  console.log('wires added:', wireCount, '/ attempted', wired)
  await shot('02-wired.png')

  // 3) 开关通断：轻点开关卡片（拖拽位移 <4px）
  const swPos = await page.evaluate((id) => window.__lab3dTermScreen(id, 1), sw)
  if (swPos) {
    // 轻点卡片主体（远离接线柱热区）
    await page.mouse.move(swPos.x - 20, swPos.y - 240)
    await page.mouse.down()
    await sleep(60)
    await page.mouse.move(swPos.x - 18, swPos.y - 239)
    await page.mouse.up()
    await sleep(500)
  }
  const swState = await page.evaluate((id) => {
    const c = window.__lab3dStore.getState().components.find((x) => x.id === id)
    return c ? c.props.closed : null
  }, sw)
  console.log('switch closed after tap:', swState)
  await shot('03-switch-toggled.png')

  // 4) 调变阻器 → 灯泡亮度应变（看 store 的 resistance 与求解结果）
  await page.evaluate((id) => window.__lab3dStore.getState().setParam(id, 'resistance', 2), rheo)
  await sleep(400)
  await shot('04-rheo-low.png')
  await page.evaluate((id) => window.__lab3dStore.getState().setParam(id, 'resistance', 50), rheo)
  await sleep(400)
  await shot('05-rheo-high.png')

  const final = await page.evaluate(() => {
    const st = window.__lab3dStore.getState()
    return { comps: st.components.length, wires: st.wires.length }
  })
  console.log(JSON.stringify({ final, errors }, null, 2))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
