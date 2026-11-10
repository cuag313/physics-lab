#!/usr/bin/env node
/** 临时验证：导线选中 + 红/绿/黑三色切换 */
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

  // 进入电学虚拟实验室
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

  // 点击第一根导线的命中区（选中）
  const clicked = await page.evaluate(() => {
    const svg = document.querySelector('.esvg-wirelayer')
    if (!svg) return 'no svg'
    const hits = svg.querySelectorAll('path[style*="cursor: pointer"]')
    if (!hits.length) return 'no hit path'
    hits[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    return 'ok,hits=' + hits.length
  })
  await sleep(400)
  const selInfo = await page.evaluate(() => {
    const g = document.querySelector('.esvg-wirelayer g')
    if (!g) return 'no g'
    const paths = g.querySelectorAll('path')
    return JSON.stringify({
      count: paths.length,
      hitStroke: paths[0] && paths[0].getAttribute('stroke'),
      mainStroke: paths[1] && paths[1].style.stroke,
      hasDelete: !!g.querySelector('text'),
    })
  })
  console.log('click:', clicked, '| selected:', selInfo)
  await page.screenshot({ path: path.join(OUT, '10-sel-default.png') })

  // 红
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.title === '红色导线')
    if (b) b.click()
  })
  await sleep(300)
  await page.screenshot({ path: path.join(OUT, '11-sel-red.png') })

  // 绿
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.title === '绿色导线')
    if (b) b.click()
  })
  await sleep(300)
  await page.screenshot({ path: path.join(OUT, '12-sel-green.png') })

  // 黑
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.title === '黑色导线')
    if (b) b.click()
  })
  await sleep(300)
  const afterBlack = await page.evaluate(() => {
    const g = document.querySelector('.esvg-wirelayer g')
    const paths = g.querySelectorAll('path')
    return paths[1] ? paths[1].style.stroke : 'n/a'
  })
  console.log('after black click, main stroke =', afterBlack)
  await page.screenshot({ path: path.join(OUT, '13-sel-black.png') })

  // 取消选中（点空白处）再截一张看真实颜色
  await page.evaluate(() => {
    const canvas = document.querySelector('.esvg-canvas')
    if (canvas) canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    document.body.click()
  })
  await sleep(400)
  const deselected = await page.evaluate(() => {
    const g = document.querySelector('.esvg-wirelayer g')
    const paths = g.querySelectorAll('path')
    return JSON.stringify({
      hitStroke: paths[0] && paths[0].getAttribute('stroke'),
      mainStroke: paths[1] && paths[1].style.stroke,
    })
  })
  console.log('deselected:', deselected)
  await page.screenshot({ path: path.join(OUT, '14-deselect-black.png') })

  console.log('errors:', JSON.stringify(errors))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
