#!/usr/bin/env node
/**
 * 连续软电线 + 滑变通电着色 验收截图（临时脚本，被 gitignore）
 *
 * 用完整实验室的"示例电路"（电池 → 滑变 bl/tr → 灯泡 → 电流表 → 开关）：
 *   1) 开关断开：导线是连续电缆（不下垂、端点夹在柱脚），绕线不着色
 *   2) 合上开关：左段绕线（x34 → 滑片）整面变浅黄
 *   3) 把滑片拖到右边：浅黄段跟着变长
 *
 * 用法：node scripts/qa-wire-cable.cjs
 * 环境：SHOT_URL 默认 http://localhost:5199/physics-lab/
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'audit', 'fidelity')
const EDGE = process.env.SHOT_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.SHOT_URL || 'http://localhost:5199/physics-lab/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function center(page, sel, nth = 0) {
  const box = await page.evaluate((s, n) => {
    const els = document.querySelectorAll(s)
    const el = els[n]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
  }, sel, nth)
  return box
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--window-size=1680,1000', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1680, height: 1000 })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(1200)

  // 进 电学虚拟实验室
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (el) el.click()
  })
  await sleep(600)
  const ok = await page.evaluate(() => {
    const t = [...document.querySelectorAll('div')].find((d) => d.innerText && d.innerText.trim() === '电学虚拟实验室')
    if (!t) return null
    let card = t
    for (let i = 0; i < 8 && card; i++) {
      if ((card.innerText || '').includes('点击进入实验')) break
      card = card.parentElement
    }
    if (!card) return null
    // 点卡片里那行"▶ 点击进入实验"（真正的 onClick 在这层）
    const btns = [...card.querySelectorAll('div,button,a')]
      .filter((e) => (e.innerText || '').trim().startsWith('▶'))
    const target = btns.length ? btns[btns.length - 1] : card
    if (!target) return null
    target.click()   // React onClick 直接触发（卡片在首屏外，真实鼠标点不到）
    return { done: true }
  })
  if (!ok) throw new Error('电学虚拟实验室 卡片没找到')
  await sleep(2500)

  const svgCount = await page.evaluate(() => document.querySelectorAll('.esvg-wirelayer g').length)
  console.log('wire groups:', svgCount)
  const bootCount = await page.evaluate(() => document.querySelectorAll('.esvg-wiretop g').length)
  console.log('端头护套组（应在器材之上）:', bootCount)

  const clip = { x: 0, y: 60, width: 1680, height: 820 }

  // ① 开关断开
  await page.screenshot({ path: path.join(OUT, 'wire-cable-open.png'), clip })

  // ② 合上开关（点开关本体）
  const sw = await center(page, '.esvg-comp[data-type="switch"]')
  if (!sw) throw new Error('switch not found')
  await page.mouse.click(sw.x, sw.y)
  await sleep(500)
  const live = await page.evaluate(() => {
    const r = document.querySelector('.esvg-comp[data-type="rheostat"]')
    return r ? !!r.querySelector('rect[fill*="rheoLive"]') : null
  })
  console.log('switch closed → rheostat tinted?', live)
  await page.screenshot({ path: path.join(OUT, 'wire-cable-closed.png'), clip })

  // ③ 把滑片往右拖一段（不要拖到底，便于看"左段随滑片变化"）
  const sl = await page.evaluate(() => {
    const h = document.querySelector('.esvg-comp[data-type="rheostat"] .slider-handle')
    if (!h) return null
    const r = h.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (sl) {
    await page.mouse.move(sl.x, sl.y)
    await page.mouse.down()
    await page.mouse.move(sl.x + 55, sl.y, { steps: 12 })
    await page.mouse.up()
    await sleep(500)
  }
  const tint = await page.evaluate(() => {
    const r = document.querySelector('.esvg-comp[data-type="rheostat"]')
    const rect = r && r.querySelector('rect[fill*="rheoLive"]')
    return rect ? { x: rect.getAttribute('x'), w: rect.getAttribute('width') } : null
  })
  console.log('slider moved → tint rect:', JSON.stringify(tint))
  await page.screenshot({ path: path.join(OUT, 'wire-cable-slider.png'), clip })

  // 局部放大滑变（便于看绕线着色）
  const rh = await center(page, '.esvg-comp[data-type="rheostat"]')
  if (rh) {
    await page.screenshot({
      path: path.join(OUT, 'wire-cable-rheostat-zoom.png'),
      clip: { x: Math.max(0, rh.x - 220), y: Math.max(0, rh.y - 130), width: 440, height: 260 },
    })
  }

  console.log('errors:', JSON.stringify(errors))
  await browser.close()
}

main().catch((e) => { console.error(e); process.exit(1) })

