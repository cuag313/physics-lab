const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // 找到工具箱的器材项（div with cursor:pointer）
  const addItem = async (name) => {
    const clicked = await page.evaluate((n) => {
      const items = document.querySelectorAll('[title]');
      for (const el of items) {
        if (el.title.includes(n) || el.textContent.includes(n)) {
          el.click();
          return el.textContent.trim();
        }
      }
      return null;
    }, name);
    console.log('Added:', clicked || name);
    await new Promise(r => setTimeout(r, 400));
  };

  // 添加器材
  await addItem('电池');
  await addItem('滑动');
  await addItem('灯泡');
  await new Promise(r => setTimeout(r, 500));

  // 截图看初始状态
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-before.png' });
  console.log('Screenshot: before');

  // 获取canvas位置
  const canvas = await page.$('canvas');
  if (!canvas) {
    console.log('ERROR: canvas not found');
    await browser.close();
    return;
  }
  const box = await canvas.boundingBox();
  console.log('Canvas:', JSON.stringify(box));

  // 点击画布中间区域（滑变器位置）
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;

  console.log('=== Testing rheostat drag ===');
  // mousedown
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 100));

  // 向右拖动100px
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(cx + i * 5, cy);
    await new Promise(r => setTimeout(r, 30));
  }

  // mouseup
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 截图看结果
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-after.png' });
  console.log('Screenshot: after');

  console.log('Done');
  await browser.close();
})().catch(e => console.error(e));
