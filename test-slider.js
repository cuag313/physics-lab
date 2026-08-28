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

  // 监听console
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log('PAGE:', text);
    logs.push(text);
  });

  // 获取所有工具箱按钮
  const buttons = await page.$$('button');
  const btnTexts = await Promise.all(buttons.map(b => b.evaluate(el => el.textContent)));
  console.log('Buttons:', btnTexts.join(' | '));

  // 添加仪器
  const addBtn = async (keyword) => {
    for (let i = 0; i < btnTexts.length; i++) {
      if (btnTexts[i].includes(keyword)) {
        await buttons[i].click();
        console.log('Added:', keyword);
        await new Promise(r => setTimeout(r, 300));
        return true;
      }
    }
    return false;
  };

  await addBtn('电池');
  await addBtn('灯泡');
  await addBtn('滑动');
  await addBtn('电流');
  await new Promise(r => setTimeout(r, 500));

  // 截图
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-step1.png' });

  // 获取canvas位置
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  console.log('Canvas box:', JSON.stringify(box));

  // 在画布上点击一下空白区域（先取消选中）
  await page.mouse.click(box.x + 100, box.y + 100);
  await new Promise(r => setTimeout(r, 200));

  // 现在尝试在画布中间偏左点击（滑变器通常在中间）
  // 先点击滑变器区域
  const rheoX = box.x + box.width * 0.5;
  const rheoY = box.y + box.height * 0.5;
  console.log('Clicking rheostat area at:', rheoX, rheoY);
  await page.mouse.click(rheoX, rheoY);
  await new Promise(r => setTimeout(r, 500));

  // 检查是否有sliderDrag日志
  const hasSliderLog = logs.some(l => l.includes('[rheostat]'));
  console.log('Has rheostat log:', hasSliderLog);
  console.log('All page logs:', logs.filter(l => l.includes('[rheostat]') || l.includes('[Rheostat')));

  // 如果进入了sliderDrag，尝试拖动
  if (hasSliderLog) {
    console.log('Attempting slider drag...');
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 100));
    // 向右拖50px
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(rheoX + (i + 1) * 10, rheoY);
      await new Promise(r => setTimeout(r, 50));
    }
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 500));
  }

  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-step2.png' });
  console.log('Done. Logs:', logs.filter(l => l.includes('rheostat') || l.includes('Rheostat')));

  await browser.close();
})().catch(e => console.error(e));
