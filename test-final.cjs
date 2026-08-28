const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // 监听console
  page.on('console', msg => console.log('PAGE:', msg.text()));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // 点击"自由实验"
  await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent.trim() === '自由实验') {
        let parent = span.parentElement;
        while (parent && parent.tagName !== 'DIV') parent = parent.parentElement;
        if (parent) { parent.click(); return; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // 添加器材
  const addItem = async (name) => {
    await page.evaluate((n) => {
      const items = document.querySelectorAll('[title]');
      for (const el of items) {
        if (el.title.includes(n)) { el.click(); return; }
      }
    }, name);
    await new Promise(r => setTimeout(r, 400));
  };

  await addItem('电池');
  await addItem('滑动');
  await addItem('灯泡');
  await addItem('电流');
  await new Promise(r => setTimeout(r, 500));

  const canvas = await page.$('canvas');
  if (!canvas) { console.log('ERROR: no canvas'); await browser.close(); return; }
  const box = await canvas.boundingBox();
  console.log('Canvas:', JSON.stringify(box));

  // 截图 - 初始
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-v2-before.png' });

  // === 测试1: 点击滑变器，检查是否进入sliderDrag ===
  // 滑变器在画布中间
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;

  console.log('=== Test: click rheostat at', cx, cy, '===');
  await page.mouse.click(cx, cy);
  await new Promise(r => setTimeout(r, 300));

  // === 测试2: 拖动滑片 ===
  console.log('=== Test: drag slider ===');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // 向右拖
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(cx + i * 5, cy);
    await new Promise(r => setTimeout(r, 20));
  }
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 截图 - 拖动后
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-v2-after.png' });

  // === 测试3: 检查灯泡是否亮了 ===
  // 看看页面上的状态
  const status = await page.evaluate(() => {
    const scene = window.__labScene;
    if (!scene) return 'no scene';
    return {
      instrumentCount: scene.instruments.length,
      wireCount: scene.wires.length,
      circuitValid: scene.circuitEngine?.valid,
      instruments: scene.instruments.filter(i => i.type !== 'wire').map(i => ({
        type: i.type,
        x: i.x.toFixed(2),
        y: i.y.toFixed(2),
        voltage: i.voltage?.toFixed(3),
        current: i.current?.toFixed(4),
        brightness: i.state?.brightness?.toFixed(3),
      }))
    };
  });
  console.log('Scene status:', JSON.stringify(status, null, 2));

  console.log('Done');
  await browser.close();
})().catch(e => console.error(e));
