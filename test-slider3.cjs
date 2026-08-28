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

  // 点击"自由实验"
  await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.textContent.includes('自由实验') && el.children.length <= 3) {
        el.click();
        return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 现在应该在ExperimentBench了
  // 添加器材
  const addItem = async (name) => {
    await page.evaluate((n) => {
      const items = document.querySelectorAll('[title]');
      for (const el of items) {
        if (el.title.includes(n)) {
          el.click();
          return;
        }
      }
    }, name);
    await new Promise(r => setTimeout(r, 400));
  };

  await addItem('电池');
  await addItem('滑动');
  await addItem('灯泡');
  await addItem('电流');
  await new Promise(r => setTimeout(r, 500));

  // 找到canvas
  const canvas = await page.$('canvas');
  if (!canvas) {
    console.log('ERROR: canvas not found');
    // dump page content
    const html = await page.evaluate(() => document.body.innerHTML.substring(0, 1000));
    console.log('Page HTML:', html);
    await browser.close();
    return;
  }

  const box = await canvas.boundingBox();
  console.log('Canvas box:', JSON.stringify(box));

  // 截图 - 初始状态
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-before.png' });
  console.log('Before screenshot saved');

  // 在画布中间点击（滑变器位置）
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;

  console.log('=== Testing rheostat drag at', cx, cy, '===');

  // 按下
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await new Promise(r => setTimeout(r, 100));

  // 拖动到右侧
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(cx + i * 6, cy);
    await new Promise(r => setTimeout(r, 30));
  }

  // 松手
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 截图 - 拖动后
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-after.png' });
  console.log('After screenshot saved');

  console.log('Done');
  await browser.close();
})().catch(e => console.error(e));
