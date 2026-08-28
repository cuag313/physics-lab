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

  // 点击"自由实验" - 使用XPath
  const freeBtn = await page.evaluate(() => {
    // 找到包含"自由实验"文本的span，然后点击其父div
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent.trim() === '自由实验') {
        // 点击父级div
        let parent = span.parentElement;
        while (parent && parent.tagName !== 'DIV') parent = parent.parentElement;
        if (parent) {
          parent.click();
          return 'clicked';
        }
      }
    }
    return 'not found';
  });
  console.log('Free mode button:', freeBtn);
  await new Promise(r => setTimeout(r, 1500));

  // 检查是否进入了实验台
  const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas'));
  console.log('Has canvas:', hasCanvas);

  if (!hasCanvas) {
    // 再试一次 - 直接点击坐标
    console.log('Retrying click...');
    // "自由实验"卡片在页面中间偏左
    await page.click('div[style*="cursor: pointer"]');
    await new Promise(r => setTimeout(r, 1500));
    const hasCanvas2 = await page.evaluate(() => !!document.querySelector('canvas'));
    console.log('Has canvas after retry:', hasCanvas2);
    if (!hasCanvas2) {
      const html = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
      console.log('Page:', html);
      await browser.close();
      return;
    }
  }

  // 添加器材
  const addItem = async (name) => {
    const result = await page.evaluate((n) => {
      const items = document.querySelectorAll('[title]');
      for (const el of items) {
        if (el.title.includes(n)) {
          el.click();
          return el.title;
        }
      }
      return null;
    }, name);
    console.log('Added:', result || name);
    await new Promise(r => setTimeout(r, 400));
  };

  await addItem('电池');
  await addItem('滑动');
  await addItem('灯泡');
  await addItem('电流');
  await new Promise(r => setTimeout(r, 500));

  // 找到canvas
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  console.log('Canvas:', JSON.stringify(box));

  // 截图 - 初始状态
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-before.png' });

  // 点击画布中间（滑变器应该在这附近）
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  console.log('Drag test at:', cx, cy);

  // 按下 + 拖动
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(cx + i * 6, cy);
    await new Promise(r => setTimeout(r, 30));
  }
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 截图 - 拖动后
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-after.png' });
  console.log('Done, check before/after screenshots');

  await browser.close();
})().catch(e => console.error(e));
