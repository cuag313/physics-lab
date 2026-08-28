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

  // 添加器材
  const addItem = async (name) => {
    await page.evaluate((n) => {
      const items = document.querySelectorAll('[title]');
      for (const el of items) {
        if (el.title.includes(n) || el.textContent.includes(n)) {
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
  await new Promise(r => setTimeout(r, 500));

  // 查找canvas
  const canvasInfo = await page.evaluate(() => {
    const canvases = document.querySelectorAll('canvas');
    return Array.from(canvases).map(c => ({
      tag: c.tagName,
      id: c.id,
      className: c.className,
      rect: c.getBoundingClientRect()
    }));
  });
  console.log('Canvases found:', JSON.stringify(canvasInfo, null, 2));

  // 也查找所有元素的布局
  const layout = await page.evaluate(() => {
    const root = document.getElementById('root');
    if (!root) return 'no root';
    const children = root.children[0];
    if (!children) return 'no children';
    return {
      tag: children.tagName,
      className: children.className,
      childCount: children.children.length,
      rect: children.getBoundingClientRect(),
      innerHTML: children.innerHTML.substring(0, 500)
    };
  });
  console.log('Layout:', JSON.stringify(layout, null, 2));

  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-debug.png' });
  console.log('Screenshot saved');

  await browser.close();
})().catch(e => console.error(e));
