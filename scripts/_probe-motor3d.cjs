const puppeteer = require('puppeteer-core')
const CHROME = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://127.0.0.1:5199/physics-lab/'
;(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  const p = await b.newPage()
  await p.setViewport({ width: 1400, height: 900 })
  p.on('console', (m) => console.log('[console.' + m.type() + ']', m.text().slice(0, 500)))
  p.on('pageerror', (e) => console.log('[pageerror]', (e && e.stack || String(e)).slice(0, 1200)))
  p.on('requestfailed', (r) => console.log('[net-fail]', r.url().slice(0, 120), r.failure() && r.failure().errorText))
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(e => console.log('goto:', e.message))
  await new Promise(r => setTimeout(r, 2500))
  const dbg = await p.evaluate(() => {
    const c = document.querySelector('canvas')
    return { hasCanvas: !!c, dbg: c && c._dbg ? Object.keys(c._dbg) : null, bodies: document.body.innerText.slice(0, 200) }
  })
  console.log('STATE', JSON.stringify(dbg))
  await p.screenshot({ path: 'audit/fidelity/_probe.png' })
  await b.close()
})()
