const p = require('puppeteer-core')

// 用法: node scripts/qa-layout.cjs <实验名>
// 输出 Tab1 电路图墨迹包围盒相对工作区白卡片的留白/居中偏差
async function main() {
  const name = process.argv[2]
  const b = await p.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const pg = await b.newPage()
  await pg.setViewport({ width: 1366, height: 860 })
  await pg.goto('http://localhost:4174/physics-lab/', { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 600))
  await pg.evaluate(() => {
    const t = [...document.querySelectorAll('.category-tab')].find(x => x.innerText.includes('电学'))
    if (t) t.click()
  })
  await new Promise(r => setTimeout(r, 400))
  await pg.evaluate((n) => {
    const all = [...document.querySelectorAll('div,button')]
    let best = null
    for (const d of all) {
      const tx = d.innerText || ''
      if (tx.includes(n) && tx.includes('点击进入实验') && tx.length < 280) {
        if (!best || tx.length < (best.innerText || '').length) best = d
      }
    }
    if (best) best.click()
    else throw new Error('not found: ' + n)
  }, name)
  await new Promise(r => setTimeout(r, 1800))
  await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    if (cv && cv._S) { const s = cv._S.current; if ('switchClosed' in s) s.switchClosed = true }
  })
  await new Promise(r => setTimeout(r, 700))
  const rect = await pg.evaluate(() => {
    const cv = document.querySelector('canvas')
    const r = cv.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  const shot = await pg.screenshot({ encoding: 'base64', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } })
  const an = await pg.evaluate((b64) => new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = img.width; cv.height = img.height
      const ctx = cv.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data
      const at = (x, y) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2]] }
      // 左侧工作区：画布宽的 54% 内，y 在 2%..92%（避开右侧面板与底部步骤条）
      const limX = Math.floor(img.width * 0.54), yLo = Math.floor(img.height * 0.02), yHi = Math.floor(img.height * 0.92)
      let cminX = 1e9, cmaxX = -1, cminY = 1e9, cmaxY = -1
      for (let y = yLo; y < yHi; y += 2) {
        for (let x = 0; x < limX; x += 2) {
          const [r, g, bl] = at(x, y)
          if (r > 250 && g > 250 && bl > 250) {
            if (x < cminX) cminX = x
            if (x > cmaxX) cmaxX = x
            if (y < cminY) cminY = y
            if (y > cmaxY) cmaxY = y
          }
        }
      }
      let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0
      for (let y = yLo; y < yHi; y++) {
        for (let x = 0; x < limX; x++) {
          const [r, g, bl] = at(x, y)
          if (r + g + bl < 600) {
            n++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      res({ imgW: img.width, imgH: img.height, card: { cminX, cmaxX, cminY, cmaxY }, ink: { minX, maxX, minY, maxY, n } })
    }
    img.src = 'data:image/png;base64,' + b64
  }), shot)
  const c = an.card, k = an.ink
  console.log(name, 'ink bbox', JSON.stringify(k))
  if (c.cmaxX > 0 && k.maxX > 0) {
    console.log('  留白 左', (k.minX - c.cminX).toFixed(0), '右', (c.cmaxX - k.maxX).toFixed(0),
      '上', (k.minY - c.cminY).toFixed(0), '下', (c.cmaxY - k.maxY).toFixed(0))
    console.log('  水平居中偏差', (((k.minX + k.maxX) / 2) - ((c.cminX + c.cmaxX) / 2)).toFixed(1),
      ' 垂直居中偏差', (((k.minY + k.maxY) / 2) - ((c.cminY + c.cmaxY) / 2)).toFixed(1))
    console.log('  墨迹占卡片', ((k.maxX - k.minX) / (c.cmaxX - c.cminX) * 100).toFixed(1) + '% x',
      ((k.maxY - k.minY) / (c.cmaxY - c.cminY) * 100).toFixed(1) + '%')
  }
  await b.close()
}

main().catch(e => { console.error(e); process.exit(1) })
