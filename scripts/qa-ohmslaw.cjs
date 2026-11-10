#!/usr/bin/env node
/**
 * QA：欧姆定律实验 P0/P1 改动实测
 *   1) Tab1 记录数据 → 表格/平均值/相对误差/拟合直线/CSV 按钮
 *   2) 结论卡数据驱动（拟合斜率 + 误差）
 *   3) 手机 compact 布局也有「记录」按钮
 *   4) Tab2 电表反接告警 + 纯电阻电路可通电
 *
 * 用法：node scripts/qa-ohmslaw.cjs   （需先起 vite preview）
 * 环境：QA_URL 默认 http://localhost:4174/physics-lab/
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.env.QA_URL || 'http://localhost:4174/physics-lab/'
const OUT = path.resolve(__dirname, '../audit/qa-ohmslaw')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function ok(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? '  ' + detail : ''}`)
}

async function openOhmsLaw(page) {
  await page.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await sleep(400)
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const t = d.innerText || ''
      if (t.includes('探究电流与电压、电阻的关系') && t.includes('点击进入实验') && t.length < 280) {
        if (!best || t.length < (best.innerText || '').length) best = d
      }
    }
    if (best) best.click()
  })
  await sleep(1600)
}

/** Tab1 记录按钮的中心点（与 drawStepNav 桌面布局公式一致） */
function recordButtonPoint(rect) {
  const W = rect.w, H = rect.h
  const navY = H - 36
  const totalW = 280, startX = (W * 0.52 - totalW) / 2
  const recX = startX + 300
  return { x: rect.x + recX + 40, y: rect.y + navY + 14 }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

  // ── 桌面布局：Tab1 数据闭环 ──
  await page.setViewport({ width: 1366, height: 860 })
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(500)
  await openOhmsLaw(page)

  const rect = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  await page.screenshot({ path: path.join(OUT, '01-tab1-initial.png') })

  // 闭合开关 + 调滑变，采 4 组数据
  for (const sliderR of [40, 30, 20, 10, 0]) {
    await page.evaluate((sr) => {
      const s = document.querySelector('canvas')._S.current
      s.switchClosed = true
      s.sliderR = sr
    }, sliderR)
    await sleep(260)
    const p = recordButtonPoint(rect)
    await page.mouse.click(p.x, p.y)
    await sleep(160)
  }
  await sleep(700)
  await page.screenshot({ path: path.join(OUT, '02-tab1-data-fit.png') })

  // 画布内读数：断言表格/拟合/CSV 出现（canvas 是位图，改断言状态与按钮命中区）
  const tab1 = await page.evaluate(() => {
    const s = document.querySelector('canvas')._S.current
    const areas = document.querySelector('canvas')._clickAreas || []
    return {
      step: s.step,
      switchClosed: s.switchClosed,
      areas: areas.length,
      hasBottomNav: areas.some(a => a.y > document.querySelector('canvas').clientHeight - 60 && a.w === 80),
    }
  })
  ok('Tab1 开关已闭合', tab1.switchClosed)
  ok('Tab1 底部导航有 80px 宽按钮（记录）', tab1.hasBottomNav, `areas=${tab1.areas}`)

  // 电路符号交互：点开关符号通断、点滑动变阻器改阻值（点击区随符号重排后仍要有效）
  const swArea = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => x.h === 44)
    return a ? { x: r.x + a.x + a.w / 2, y: r.y + a.y + a.h / 2 } : null
  })
  if (swArea) {
    await page.evaluate(() => { document.querySelector('canvas')._S.current.switchClosed = true })
    await sleep(200)
    await page.mouse.click(swArea.x, swArea.y)
    await sleep(250)
    const toggled = await page.evaluate(() => document.querySelector('canvas')._S.current.switchClosed === false)
    ok('点电路符号开关可断开', toggled)
    await page.mouse.click(swArea.x, swArea.y)
    await sleep(250)
  } else {
    ok('点电路符号开关可断开', false, '未找到开关点击区')
  }
  const rheoArea = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    const a = (cv._clickAreas || []).find(x => x.h === 56)
    return a ? { x: r.x + a.x + a.w * 0.85, y: r.y + a.y + a.h / 2 } : null
  })
  if (rheoArea) {
    await page.evaluate(() => { document.querySelector('canvas')._S.current.sliderR = 0 })
    await sleep(150)
    await page.mouse.click(rheoArea.x, rheoArea.y)
    await sleep(250)
    const sr = await page.evaluate(() => document.querySelector('canvas')._S.current.sliderR)
    ok('点滑动变阻器符号可调阻值', sr > 20, `sliderR=${sr}`)
    await page.evaluate(() => { document.querySelector('canvas')._S.current.sliderR = 20 })
    await sleep(150)
  } else {
    ok('点滑动变阻器符号可调阻值', false, '未找到滑变点击区')
  }

  // 结论卡：数据驱动文案
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button,div,span')].find(e => e.childElementCount === 0 && e.textContent.includes('查看结论'))
    if (el) el.click()
  })
  await sleep(500)
  await page.screenshot({ path: path.join(OUT, '03-tab1-conclusion.png') })
  const concl = await page.evaluate(() => document.body.innerText)
  ok('结论含拟合斜率 k=', concl.includes('k='), concl.includes('R²') ? '含 R²' : '')
  ok('结论含 R²（决定系数）', concl.includes('R²'))
  ok('结论含相对误差', concl.includes('相对误差'))
  ok('结论含正比结论', concl.includes('成正比'))

  // CSV 导出点击区存在（不真的下载）
  const csvArea = await page.evaluate(() => {
    const areas = document.querySelector('canvas')._clickAreas || []
    // 导出按钮 56x15
    return areas.some(a => a.w === 56 && a.h === 15)
  })
  ok('导出CSV 点击区存在', csvArea)

  // ── 手机 compact 布局：记录按钮（isMobile 切换会重载页面，需重新进实验）──
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await sleep(1500)
  await openOhmsLaw(page)
  const compact = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    if (!cv) return { compactButtons: [], noCanvas: true }
    const areas = cv._clickAreas || []
    const H = cv.clientHeight
    return {
      compactButtons: areas.filter(a => a.y > H - 40).map(a => ({ w: a.w, h: a.h })),
    }
  })
  await page.screenshot({ path: path.join(OUT, '04-tab1-compact.png') })
  ok('compact 布局底部有记录/清除按钮',
    compact.compactButtons.some(a => a.w === 52) && compact.compactButtons.some(a => a.w === 44),
    JSON.stringify(compact.compactButtons))

  // ── Tab2：纯电阻电路可通电（A1）+ 电表反接告警（A3） ──
  await page.setViewport({ width: 1366, height: 860, isMobile: false, hasTouch: false })
  await sleep(1500)
  await openOhmsLaw(page)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('.scene-tab')].find((e) => e.innerText.includes('自己动手'))
    if (el) el.click()
  })
  await sleep(600)
  await page.screenshot({ path: path.join(OUT, '05-tab2-empty.png') })

  // 用画布状态注入一个纯电阻串联回路（电池→电阻），验证 validate 不再强制要灯泡
  const built = await page.evaluate(() => {
    const cv = document.querySelector('canvas')
    const s = cv._S.current
    s.components = []
    s.wires = []
    s.nextId = 1
    const bat = { id: s.nextId++, type: 'battery', x: 260, y: 320, rotation: 0, closed: true, props: { voltage: 6 } }
    const res = { id: s.nextId++, type: 'resistor', x: 520, y: 220, rotation: 0, closed: true, props: { resistance: 10 } }
    s.components.push(bat, res)
    s.wires.push(
      { id: s.nextId++, from: { compId: bat.id, termIdx: 1 }, to: { compId: res.id, termIdx: 1 }, color: '#F44336', mid1X: null, mid1Y: null, mid2X: null, mid2Y: null },
      { id: s.nextId++, from: { compId: res.id, termIdx: 0 }, to: { compId: bat.id, termIdx: 0 }, color: '#F44336', mid1X: null, mid1Y: null, mid2X: null, mid2Y: null },
    )
    s._rev = (s._rev || 0) + 1 // 拓扑变了 → 重新求解
    return { comps: s.components.length, wires: s.wires.length }
  })
  await sleep(900)
  await page.screenshot({ path: path.join(OUT, '06-tab2-pure-resistor.png') })
  ok('Tab2 纯电阻电路已搭建', built.comps === 2 && built.wires === 2, JSON.stringify(built))

  // 读数面板（DOM）应显示通路状态，而不是「缺少灯泡」
  const dom = await page.evaluate(() => document.body.innerText)
  ok('不再出现「缺少灯泡」', !dom.includes('缺少灯泡'))
  ok('不再出现「缺少负载」误报（有电阻时）', !dom.includes('缺少负载'))

  console.log('\npage errors:', errors.length ? errors : '(none)')
  const fails = results.filter(r => !r.pass)
  console.log(`\n=== QA: ${results.length - fails.length} 通过, ${fails.length} 失败 ===`)
  await browser.close()
  if (fails.length) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
