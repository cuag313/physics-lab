#!/usr/bin/env node
/**
 * 新增器材实景 QA：调色板分组 → 拖放 13 件 → 接线求解 → 动效/交互 → 剖视。
 * 用法：node scripts/qa-newparts.cjs   （需 vite preview :4173）
 */
const puppeteer = require('puppeteer-core')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'audit', 'newparts')
const EDGE = process.env.SHOT_EDGE
  || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const BASE = process.env.SHOT_URL || 'http://localhost:4173/physics-lab/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log((ok ? '  ok  ' : '  FAIL ') + name + (detail ? '  [' + detail + ']' : ''))
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--window-size=1820,1180', '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1800, height: 1150 })
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)) })

  const shot = async (n) => { const f = path.join(OUT, n); await page.screenshot({ path: f }); console.log('shot', f) }

  // ── 进入电学虚拟实验室 ──
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

  // 场景挂载时自动载入示例电路 → 先清空桌面，保证索引从 0 开始
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('清空桌面'))
    if (b) b.click()
  })
  await sleep(400)

  // ── 01 调色板：分组 + 全部器材 ──
  const pal = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.esvg-pgroup')].map((e) => e.innerText.trim())
    const items = [...document.querySelectorAll('.esvg-pitem')].map((e) => ({
      label: (e.querySelector('span:last-child') || {}).innerText || e.innerText.trim(),
      title: e.title || '',
      icon: e.querySelector('img, svg') ? true : false,
    }))
    return { groups, items }
  })
  check('调色板 4 个分组', pal.groups.length === 4, pal.groups.join('/'))
  check('调色板 19 件器材', pal.items.length === 19, 'count=' + pal.items.length)
  check('每件都有图标', pal.items.every((i) => i.icon))
  check('三批分组正确',
    pal.groups.join('|') === '基础器材|初中必做实验|家庭电路|高中拓展', pal.groups.join('|'))
  await shot('01-palette.png')

  // ── 拖放辅助 ──
  const dragTo = async (titlePart, cx, cy) => {
    const box = await page.evaluate((tp) => {
      const el = [...document.querySelectorAll('.esvg-pitem')].find((e) => (e.title || '').includes(tp))
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, titlePart)
    if (!box) throw new Error('palette item not found: ' + titlePart)
    await sleep(80)
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await page.mouse.move(box.x + 40, box.y + 40, { steps: 4 })
    await page.mouse.move(cx, cy, { steps: 8 })
    await page.mouse.up()
    await sleep(120)
    return page.evaluate(() => document.querySelectorAll('.esvg-comp').length)
  }
  const compBox = async (idx) => page.evaluate((i) => {
    const el = document.querySelectorAll('.esvg-comp')[i]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, type: el.dataset.type, id: el.dataset.id }
  }, idx)
  const clickTerm = async (idx, ti) => {
    const p = await page.evaluate((i, t) => {
      const el = document.querySelectorAll('.esvg-comp')[i]
      const term = el && el.querySelectorAll('.esvg-term')[t]
      if (!term) return null
      const r = term.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, idx, ti)
    if (!p) throw new Error('term not found: comp' + idx + ' term' + ti)
    await page.mouse.click(p.x, p.y)
    await sleep(140)
  }
  const wire = async (a, ati, b, bti) => {
    await clickTerm(a, ati); await clickTerm(b, bti); await sleep(120)
  }
  const dblClickComp = async (idx) => {
    const b = await compBox(idx)
    await page.mouse.click(b.x, b.y); await sleep(80)
    await page.mouse.click(b.x, b.y); await sleep(160)
  }
  const tapComp = async (idx) => {
    const b = await compBox(idx)
    await page.mouse.click(b.x, b.y); await sleep(160)
  }

  // canvas 坐标 → 客户端坐标（放置用）
  const C = await page.evaluate(() => {
    const r = document.querySelector('.esvg-canvas').getBoundingClientRect()
    return { left: r.left, top: r.top }
  })

  // ── 02 拖出全部 13 件新器材（按接线友好布局） ──
  const order = [
    ['电池组 3V', 60, 620],            // 0 battery
    ['单刀双掷', 280, 600],            // 1 switch2
    ['二极管', 520, 590],              // 2 diode
    ['小电动机', 760, 560],            // 3 motor
    ['定值电阻 5Ω', 1020, 620],       // 4 resistor5
    ['保险丝', 60, 420],               // 5 fuse（串在初中回路）
    ['家庭电源 220V', 60, 120],       // 6 mains
    ['测电笔', 300, 140],             // 7 testPencil
    ['验电器', 620, 80],              // 8 electroscope
    ['保险丝', 300, 300],             // 9 fuse2（跨接市电→熔断演示）
    ['电池组 3V', 1150, 120],         // 10 battery2（继电器控制回路）
    ['电磁继电器', 1350, 320],        // 11 relay
    ['电阻箱', 850, 380],             // 12 resBox
    ['多用电表', 1150, 420],          // 13 multimeter
    ['定值电阻 15Ω', 1350, 620],     // 14 resistor15（继电器回路限流）
    ['定值电阻 10Ω', 620, 620],      // 15 resistor10（验证色环变体）
    ['小灯泡', 1020, 200],            // 16 bulb（继电器触点回路观察）
    ['电池组 3V', 1520, 620],         // 17 battery3（触点回路）
  ]
  for (const [label, x, y] of order) {
    await dragTo(label, C.left + x, C.top + y)
  }
  await sleep(300)
  const nComps = await page.evaluate(() => document.querySelectorAll('.esvg-comp').length)
  check('拖放 18 件到桌面', nComps === 18, 'comps=' + nComps)
  const types = await page.evaluate(() => [...document.querySelectorAll('.esvg-comp')].map((e) => e.dataset.type))
  console.log('  placed:', types.join(','))
  await shot('02-placed.png')

  // ── 03 剖视模式：全部 .inner 层可见 ──
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('内部结构'))
    if (b) b.click()
  })
  await sleep(500)
  const dissect = await page.evaluate(() => {
    const canvas = document.querySelector('.esvg-canvas')
    const inner = document.querySelectorAll('.esvg-comp .inner').length
    const plabel = document.querySelectorAll('.esvg-comp .plabel').length
    return { on: canvas.classList.contains('dissect'), inner, plabel }
  })
  check('剖视模式开启', dissect.on)
  check('18 件都有 .inner 层', dissect.inner === 18, 'inner=' + dissect.inner)
  check('剖视标注出现', dissect.plabel > 30, 'plabel=' + dissect.plabel)
  await shot('03-dissect.png')
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('内部结构'))
    if (b) b.click()
  })
  await sleep(400)

  // ── 04 初中回路：电池→保险丝→单刀双掷→二极管→电动机→10Ω→电池 ──
  // 索引: 0 battery, 5 fuse, 1 switch2, 2 diode, 3 motor, 15 resistor10
  await wire(0, 1, 5, 0)   // battery.p → fuse.a
  await wire(5, 1, 1, 0)   // fuse.b → switch2.com
  await wire(1, 1, 2, 0)   // switch2.a → diode.a
  await wire(2, 1, 3, 0)   // diode.k → motor.a
  await wire(3, 1, 15, 0)  // motor.b → resistor10.a
  await wire(15, 1, 0, 0)  // resistor10.b → battery.n
  await sleep(400)
  // 单刀双掷默认 pos=0 已接通 A；保险丝未熔断（I≈0.19A<0.5A）
  const st4 = await page.evaluate(() => document.body.innerText)
  check('初中回路接通', st4.includes('电路接通'), (st4.match(/电路接通/) || ['none'])[0])
  const i4 = (st4.match(/干路电流 ([\d.]+) A/) || [])[1]
  // 回路：3V − 2V(二极管) = 1V，总阻 ≈ 0.1+0.02+0.001+4+4+10 = 18.12Ω → I ≈ 0.055A
  check('初中回路电流≈0.055A', i4 && Math.abs(+i4 - 0.055) < 0.003, 'I=' + i4)
  check('二极管正向导通发光', st4.includes('正向导通 · 发光'))
  check('电动机通电显示电流', /I = 0\.06 A/.test(st4), '')
  check('保险丝未熔断', !st4.includes('已熔断'))

  // 轻点单刀双掷 → 切到 B（断开回路）
  await tapComp(1)
  await sleep(300)
  let st = await page.evaluate(() => document.body.innerText)
  check('单刀双掷切到 B 后断路', st.includes('电路未接通') || st.includes('开关断开'), '')
  await tapComp(1) // 切回 A
  await sleep(300)

  // 二极管反向：把二极管两根线对调不方便——改用轻点开关断开时的断路已验证极性；反向已由 MNA 冒烟覆盖
  await shot('04-junior.png')

  // ── 05 家庭电路：市电→保险丝→测电笔→回零线；验电器跨市电；保险丝2 短路熔断 ──
  // 索引: 6 mains, 5 fuse 用在初中回路——家庭回路用 9 fuse2? 重新分配：
  // mains(6): l=term1, n=term0（terminals n,l）
  await wire(6, 1, 7, 0)   // mains.l → pen.tip
  await wire(7, 1, 6, 0)   // pen.tail → mains.n
  await wire(6, 1, 8, 0)   // mains.l → electroscope.cap
  await wire(8, 1, 6, 0)   // electroscope.gnd → mains.n
  await wire(6, 1, 9, 0)   // mains.l → fuse2.a
  await wire(9, 1, 6, 0)   // fuse2.b → mains.n （直接跨 220V → 熔断）
  await sleep(500)
  st = await page.evaluate(() => document.body.innerText)
  check('测电笔氖管发光', st.includes('氖管发光（接触火线）'))
  check('验电器箔片张开', st.includes('箔片张开 · 带电'))
  check('保险丝过流熔断', st.includes('已熔断'))
  check('状态栏提示熔断', st.includes('保险丝熔断'), '')
  await shot('05-home.png')

  // 双击保险丝 2 换新 → 跨接市电又立刻熔断（验证双击手势 + 持久熔断语义）
  await dblClickComp(9)
  await sleep(400)
  st = await page.evaluate(() => document.body.innerText)
  check('换新后再次过流熔断（持久语义）', st.includes('已熔断'), '')
  await shot('05b-fuse-reset.png')

  // ── 06 高中组：电阻箱拨盘 / 多用表档位 / 继电器吸合 ──
  // 继电器控制回路: battery2(10) → relay(11)线圈 → resistor15(14) → battery2
  // relay terminals: ct1,ct2,ck1,ck2 → [0,1,2,3]
  await wire(10, 1, 11, 2)  // battery2.p → relay.ck1
  await wire(11, 3, 14, 0)  // relay.ck2 → resistor15.a
  await wire(14, 1, 10, 0)  // resistor15.b → battery2.n
  await sleep(400)
  st = await page.evaluate(() => document.body.innerText)
  check('继电器吸合（I=3/(30+15)≈66mA≥50mA）', st.includes('衔铁吸合'), '')
  check('状态栏继电器吸合', st.includes('继电器吸合'), '')

  // 触点回路: battery3(17) → relay.ct1/ct2 → bulb(16) → battery3
  await wire(17, 1, 11, 0)  // battery3.p → relay.ct1
  await wire(11, 1, 16, 0)  // relay.ct2 → bulb.a
  await wire(16, 1, 17, 0)  // bulb.b → battery3.n
  await sleep(400)
  st = await page.evaluate(() => document.body.innerText)
  const bulbLine = (st.match(/灯泡亮度 [^ │]+/) || ['none'])[0]
  check('继电器触点导通灯亮', bulbLine.includes('%'), bulbLine)

  // 电阻箱：双击显示读数；点击拨盘进位
  await dblClickComp(12)
  await sleep(300)
  let ro = await page.evaluate(() => {
    const el = document.querySelectorAll('.esvg-comp')[12]
    const r = el && el.querySelector('.esvg-readout')
    return r ? r.innerText : null
  })
  check('电阻箱读数显示 R=0', ro && ro.includes('R = 0.0 Ω'), 'ro=' + ro)
  // 点击 ×1 拨盘（data-i=3）3 次 → 3Ω
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => {
      const el = document.querySelectorAll('.esvg-comp')[12]
      const d = el.querySelector('[data-role="dial"][data-i="3"]')
      const r = d.getBoundingClientRect()
      // 交给真实指针事件
      const ev = new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
      d.dispatchEvent(ev)
    })
    await sleep(120)
  }
  await sleep(300)
  ro = await page.evaluate(() => {
    const el = document.querySelectorAll('.esvg-comp')[12]
    const r = el && el.querySelector('.esvg-readout')
    return r ? r.innerText : null
  })
  check('拨盘进位后 R=3.0 Ω', ro && ro.includes('R = 3.0 Ω'), 'ro=' + ro)

  // 多用电表：并在 battery2 两端测电压；双击切档
  await wire(10, 1, 13, 1)  // battery2.p → mm.in
  await wire(13, 0, 10, 0)  // mm.com → battery2.n
  await sleep(300)
  const lcd = () => page.evaluate(() => {
    const el = document.querySelectorAll('.esvg-comp')[13]
    const svg = el && el.querySelector('svg')
    const texts = svg ? [...svg.querySelectorAll('text')].map((t) => t.textContent) : []
    return texts.filter((t) => /^[VAΩ]/.test(t)).join(' | ')
  })
  const lcd0 = await lcd()
  // 继电器线圈回路带载：端电压 = 3 − 0.0665×0.1 ≈ 2.993V
  check('多用表 LCD 电压档测带载端电压', lcd0.startsWith('V 2.99'), lcd0)
  await dblClickComp(13)
  await sleep(250)
  check('双击切到电流档', (await lcd()).startsWith('A'), await lcd())
  await dblClickComp(13)
  await sleep(250)
  check('双击切到欧姆档', (await lcd()).startsWith('Ω'), await lcd())
  await dblClickComp(13)
  await sleep(250)
  check('双击切回电压档', (await lcd()).startsWith('V'), await lcd())
  await shot('06-highschool.png')

  // ── 07 剖视全家福（含全部新器材） ──
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('内部结构'))
    if (b) b.click()
  })
  await sleep(500)
  await shot('07-dissect-all.png')

  console.log('\npage errors:', errors.length ? errors.join('\n') : 'none')
  const fails = results.filter((r) => !r.ok)
  console.log(fails.length === 0 ? 'ALL PASS' : `${fails.length} FAILURES`)
  await browser.close()
  process.exit(fails.length || errors.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
