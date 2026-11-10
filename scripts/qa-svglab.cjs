#!/usr/bin/env node
/**
 * 电学虚拟实验室（SVG）QA：示例电路 → 开关通断 → 滑片调阻 → 剖视 → 截图
 * 用法： node scripts/qa-svglab.cjs
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'audit', 'svglab')
const EDGE = process.env.SHOT_EDGE
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.SHOT_URL || 'http://localhost:4173/physics-lab/'

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

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
      if (t.includes('电学虚拟实验室') && t.includes('点击进入实验') && t.length < 300) {
        if (!best || t.length < (best.innerText || '').length) best = d
      }
    }
    if (best) { best.click(); return true }
    return false
  })
  if (!ok) throw new Error('experiment not found')
  await sleep(2500)

  const shot = async (n) => { const f = path.join(OUT, n); await page.screenshot({ path: f }); console.log('shot', f) }
  await shot('01-demo.png')

  const info = async () => page.evaluate(() => {
    const t = document.body.innerText
    return {
      comps: document.querySelectorAll('.esvg-comp').length,
      wires: document.querySelectorAll('.esvg-wire').length,
      terms: document.querySelectorAll('.esvg-term').length,
      dissectBtn: !!([...document.querySelectorAll('button')].find((b) => b.innerText.includes('内部结构'))),
      status: (t.match(/(电路接通|开关断开|电路未接通|电路中还没有电源)/) || ['none'])[0],
      bulb: (t.match(/灯泡亮度 [^ │]+/) || ['none'])[0],
    }
  })
  console.log('demo:', JSON.stringify(await info()))

  // 1) 单击开关 → 闭合
  const sw = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.esvg-comp')].find((e) => e.dataset.type==='switch')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (sw) {
    await page.mouse.click(sw.x, sw.y)
    await sleep(500)
  }
  console.log('after switch click:', JSON.stringify(await info()))
  await shot('02-closed.png')

  // 2) 拖变阻器滑片（向右 → 阻值变大 → 灯变暗）
  const sl = await page.evaluate(() => {
    const h = document.querySelector('.slider-handle')
    if (!h) return null
    const r = h.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (sl) {
    await page.mouse.move(sl.x, sl.y)
    await page.mouse.down()
    await page.mouse.move(sl.x + 80, sl.y, { steps: 8 })
    await page.mouse.up()
    await sleep(500)
  }
  console.log('after slider:', JSON.stringify(await info()))
  await shot('03-slider.png')

  // 3) 双击电流表显示读数
  const am = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.esvg-comp')].find((e) => e.dataset.type==='ammeter')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (am) {
    // 两次轻点 = 用户的双击（走 tap-tap 检测路径）
    await page.mouse.click(am.x, am.y)
    await sleep(90)
    await page.mouse.click(am.x, am.y)
    await sleep(500)
  }
  const readout = await page.evaluate(() => {
    const ros = [...document.querySelectorAll('.esvg-readout')].filter((e) => (e.getAttribute('style') || '').includes('opacity: 1'))
    return ros.map((e) => e.textContent)
  })
  console.log('meter readouts:', JSON.stringify(readout))
  await shot('04-readout.png')

  // 4) 剖视（内部结构）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('内部结构'))
    if (b) b.click()
  })
  await sleep(600)
  const dissect = await page.evaluate(() => ({
    on: !!document.querySelector('.esvg-canvas.dissect'),
    labels: [...document.querySelectorAll('.plabel')].filter((e) => +getComputedStyle(e).opacity > 0.3).length,
  }))
  console.log('dissect:', JSON.stringify(dissect))
  await shot('05-dissect.png')

  console.log(JSON.stringify({ errors }, null, 2))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })

