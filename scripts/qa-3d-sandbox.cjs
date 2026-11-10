#!/usr/bin/env node
/**
 * 3D 电学沙盒 QA：加载页面 → 真实鼠标接线 → 仿真判定 → 截图
 * 用法： node scripts/qa-3d-sandbox.cjs
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'audit', 'sandbox3d')
const EDGE = process.env.SHOT_EDGE
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.SHOT_URL || 'http://127.0.0.1:8791'
const PAGE = BASE + '/' + encodeURIComponent('初中电学实验沙盒.html')

async function drag(page, x0, y0, x1, y1, steps = 12) {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
    await new Promise(r => setTimeout(r, 30))
  }
  await page.mouse.up()
  await new Promise(r => setTimeout(r, 250))
}

async function clickAt(page, x, y) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await new Promise(r => setTimeout(r, 40))
  await page.mouse.up()
  await new Promise(r => setTimeout(r, 250))
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--window-size=1440,900', '--force-device-scale-factor=1']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })

  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text())
  })

  console.log('open', PAGE)
  await page.goto(PAGE, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => window.__lab && window.__lab.devices.length > 0, { timeout: 30000 })
  await new Promise(r => setTimeout(r, 800))

  const devList = await page.evaluate(() => window.__lab.deviceList())
  console.log('devices:', JSON.stringify(devList))
  await page.screenshot({ path: path.join(OUT, 's0-default.png') })

  // 找出关键器材
  const byType = (t) => devList.find(d => d.type === t)
  const bat = byType('battery'), sw = byType('switch'), am = byType('ammeter'), bu = byType('bulb')

  async function tp(devId, termId) {
    return page.evaluate((d, t) => window.__lab.projectTerminal(d, t), devId, termId)
  }

  // 真实鼠标拉线：电源+ → 开关A，开关B → 电流表+， 电流表- → 灯泡A， 灯泡B → 电源-
  const links = [
    [bat.id, 'pos', sw.id, 'a'],
    [sw.id, 'b', am.id, 'pos'],
    [am.id, 'neg', bu.id, 'a'],
    [bu.id, 'b', bat.id, 'neg']
  ]
  for (const [d1, t1, d2, t2] of links) {
    const p1 = await tp(d1, t1)
    const p2 = await tp(d2, t2)
    console.log(`wire ${d1}:${t1} -> ${d2}:${t2}`, p1, p2)
    await drag(page, p1.x, p1.y, p2.x, p2.y, 14)
  }

  const state1 = await page.evaluate(() => {
    const r = window.__lab.evalCircuit()
    return { closed: r.closed, short: r.short, wires: window.__lab.wireSystem.wires.length }
  })
  console.log('circuit after wiring:', JSON.stringify(state1))
  await page.screenshot({ path: path.join(OUT, 's1-closed.png') })

  // 点击外壳 → 透明
  const batC = await page.evaluate((id) => window.__lab.projectDeviceCenter(id), bat.id)
  await clickAt(page, batC.x, batC.y)
  const trans = await page.evaluate((id) => {
    const d = window.__lab.devices.find(x => x.id === id)
    return d ? d.transparent : null
  }, bat.id)
  console.log('battery transparent after click:', trans)
  await new Promise(r => setTimeout(r, 700))
  await page.screenshot({ path: path.join(OUT, 's2-transparent.png') })

  // 再点一次恢复
  await clickAt(page, batC.x, batC.y)
  const trans2 = await page.evaluate((id) => {
    const d = window.__lab.devices.find(x => x.id === id)
    return d ? d.transparent : null
  }, bat.id)
  console.log('battery transparent after 2nd click:', trans2)

  // ---- 开关闸刀：单击断开 → 电路开路；再点闭合 ----
  async function clickBlade() {
    const p = await page.evaluate((id) => window.__lab.projectBlade(id), sw.id)
    await clickAt(page, p.x, p.y)
  }
  await clickBlade()
  const swOpen = await page.evaluate(() => {
    const d = window.__lab.devices.find(x => x.type === 'switch')
    return { closed: d.state.closed, circuit: window.__lab.evalCircuit().closed }
  })
  console.log('switch after click:', JSON.stringify(swOpen))
  await clickBlade()
  const swClose = await page.evaluate(() => {
    const d = window.__lab.devices.find(x => x.type === 'switch')
    return { closed: d.state.closed, circuit: window.__lab.evalCircuit().closed }
  })
  console.log('switch after 2nd click:', JSON.stringify(swClose))

  // ---- 指针应有偏转 ----
  await new Promise(r => setTimeout(r, 900))
  const needles = await page.evaluate(() => window.__lab.devices
    .filter(d => d.type === 'ammeter' || d.type === 'voltmeter')
    .map(d => ({ type: d.type, angle: +d.state.needleAngle.toFixed(3) })))
  console.log('needles:', JSON.stringify(needles))

  // 短路：再拉一根 电源+ → 电源-
  const bp = await tp(bat.id, 'pos')
  const bn = await tp(bat.id, 'neg')
  await drag(page, bp.x, bp.y, bn.x, bn.y, 14)
  const state2 = await page.evaluate(() => {
    const r = window.__lab.evalCircuit()
    return { closed: r.closed, short: r.short }
  })
  console.log('circuit after short wire:', JSON.stringify(state2))
  await new Promise(r => setTimeout(r, 700))
  await page.screenshot({ path: path.join(OUT, 's3-short.png') })

  // ---- 导出拓扑 JSON 结构 ----
  const topo = await page.evaluate(() => {
    const r = window.__lab.evalCircuit()
    return {
      deviceCount: window.__lab.devices.length,
      wireCount: window.__lab.wireSystem.wires.length,
      nodes: r.topo.nodes.length,
      edges: r.topo.edges.length,
      hasBattery: r.hasBattery
    }
  })
  console.log('topology:', JSON.stringify(topo))

  // ---- 删除器材：连线应一并销毁 ----
  await page.evaluate((id) => {
    const d = window.__lab.devices.find(x => x.id === id)
    window.__lab.disposeDevice(d)
    window.__lab.evalCircuit()
  }, bu.id)
  const afterDel = await page.evaluate(() => ({
    wires: window.__lab.wireSystem.wires.length,
    devices: window.__lab.devices.length
  }))
  console.log('after delete bulb:', JSON.stringify(afterDel))

  // 旋转台面（空白拖拽）后再截一张
  await page.mouse.move(720, 200)
  await page.mouse.down()
  await page.mouse.move(980, 260, { steps: 16 })
  await page.mouse.up()
  await new Promise(r => setTimeout(r, 700))
  await page.screenshot({ path: path.join(OUT, 's4-rotated.png') })

  const report = {
    errors,
    devices: devList,
    closedAfterWiring: state1,
    shortAfterExtraWire: state2,
    transparentToggle: { afterClick: trans, afterSecondClick: trans2 },
    switchToggle: { afterOpenClick: swOpen, afterCloseClick: swClose },
    needles,
    topology: topo,
    afterDeleteBulb: afterDel,
    pass: errors.length === 0 && state1.closed === true && state1.short === false
      && state2.short === true && trans === true && trans2 === false
      && swOpen.closed === false && swOpen.circuit === false
      && swClose.closed === true && swClose.circuit === true
      && afterDel.devices === 5
      && needles.some(n => n.type === 'ammeter' && n.angle > 0.15)
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log('REPORT', JSON.stringify(report, null, 2))

  await browser.close()
  if (!report.pass) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
