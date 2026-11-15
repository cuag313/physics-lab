const puppeteer = require('puppeteer-core')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'audit/fidelity'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

;(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new' })
  const p = await b.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))

  for (const [w, h] of [[1280, 640], [1366, 768], [1600, 900], [1680, 1000]]) {
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 })
    await p.goto('http://localhost:5199/physics-lab/', { waitUntil: 'networkidle2' })
    await sleep(1250)
    await p.evaluate(() => {
      const e = [...document.querySelectorAll('.category-tab')].find((x) => x.innerText.includes('电学'))
      if (e) e.click()
    })
    await sleep(450)
    await p.evaluate(() => {
      const c = [...document.querySelectorAll('div')]
        .filter((d) => (d.innerText || '').includes('探究电流与电压') && (d.innerText || '').length < 320)
        .sort((a, b) => a.innerText.length - b.innerText.length)
      c[0].click()
    })
    await sleep(1600)

    const st = await p.evaluate(() => {
      const c = document.querySelector('canvas.canvas-fill')
      const d = c._dbg
      const r = c.getBoundingClientRect()
      const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
      if (!d) return { err: 'no _dbg' }
      ev('mousedown', d.pill3X, d.pill3Y); ev('mouseup', d.pill3X, d.pill3Y)
      return { ok: true }
    })
    await sleep(520)
    const closed = await p.evaluate(() => {
      const c = document.querySelector('canvas.canvas-fill')
      const d = c._dbg
      const r = c.getBoundingClientRect()
      const ev = (t, x, y) => c.dispatchEvent(new MouseEvent(t, { clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }))
      ev('mousedown', d.swX, d.swY); ev('mouseup', d.swX, d.swY)
      return true
    })
    await sleep(520)
    const box = await p.evaluate(() => {
      const c = document.querySelector('canvas.canvas-fill')
      const r = c.getBoundingClientRect()
      return { canvasH: Math.round(r.height), canvasW: Math.round(r.width), box: c._cardBox, mode: c._dbg.mode }
    })
    console.log(`${w}x${h} canvas=${box.canvasW}×${box.canvasH} mode=${box.mode} card=${JSON.stringify(box.box)}`)
    await p.screenshot({ path: `${OUT}/ohm-card-${w}x${h}-top.png` })

    if (box.box && box.box.maxScroll > 0) {
      const cx = box.box.x + box.box.w / 2, cy = box.box.y + 80
      // 用画布原生 wheel 事件触发滚动
      await p.evaluate(({ cx, cy, box }) => {
        const c = document.querySelector('canvas.canvas-fill')
        const r = c.getBoundingClientRect()
        for (let i = 0; i < 20; i++) {
          c.dispatchEvent(new WheelEvent('wheel', {
            deltaY: box.maxScroll / 18, clientX: r.left + cx, clientY: r.top + cy, bubbles: true,
          }))
        }
      }, { cx, cy, box: box.box })
      await sleep(600)
      const sc = await p.evaluate(() => document.querySelector('canvas.canvas-fill')._cardBox)
      console.log(`  scrolled → ${JSON.stringify(sc)}  scroll=${sc ? sc.scroll : '-'}`)
      await p.screenshot({ path: `${OUT}/ohm-card-${w}x${h}-bottom.png` })
    }
  }
  console.log('errors:', errors.length ? errors.join(' | ') : '(none)')
  await b.close()
})()
