const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', msg => {
    const t = msg.text();
    if (t.includes('Matrix') || t.includes('singular')) return;
    console.log('PAGE:', t);
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // 点击"自由实验"
  await page.evaluate(() => {
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
      if (span.textContent.trim() === '自由实验') {
        let p = span.parentElement;
        while (p && p.tagName !== 'DIV') p = p.parentElement;
        if (p) { p.click(); return; }
      }
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // 点击"⚡ 快速搭建"按钮
  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const btn of btns) {
      if (btn.textContent.includes('快速搭建')) {
        btn.click();
        return btn.textContent.trim();
      }
    }
    return null;
  });
  console.log('Clicked:', clicked);
  await new Promise(r => setTimeout(r, 1000));

  // 检查电路状态
  const status = await page.evaluate(() => {
    const scene = window.__labScene;
    if (!scene) return 'no scene';
    return {
      instrumentCount: scene.instruments.filter(i => i.type !== 'wire').length,
      wireCount: scene.wires.length,
      circuitValid: scene.circuitEngine?.valid,
      instruments: scene.instruments.filter(i => i.type !== 'wire').map(i => ({
        type: i.type,
        voltage: i.voltage?.toFixed(3),
        current: i.current?.toFixed(4),
        brightness: i.state?.brightness?.toFixed(3),
        needleAngle: i.state?.needleAngle?.toFixed(3),
        sliderPos: i.params?.sliderPos?.value?.toFixed(3),
      }))
    };
  });
  console.log('=== After quick circuit ===');
  console.log(JSON.stringify(status, null, 2));

  // 截图
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-quick.png' });

  // 测试拖动滑变器
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  // 滑变器在 x=0, y=0 → 屏幕中间
  const rheoX = box.x + box.width * 0.5;
  const rheoY = box.y + box.height * 0.5;

  console.log('=== Dragging slider ===');
  await page.mouse.move(rheoX, rheoY);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(rheoX + i * 8, rheoY);
    await new Promise(r => setTimeout(r, 30));
  }
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 500));

  // 再次检查状态
  const status2 = await page.evaluate(() => {
    const scene = window.__labScene;
    return {
      circuitValid: scene.circuitEngine?.valid,
      instruments: scene.instruments.filter(i => i.type !== 'wire').map(i => ({
        type: i.type,
        voltage: i.voltage?.toFixed(3),
        current: i.current?.toFixed(4),
        brightness: i.state?.brightness?.toFixed(3),
        sliderPos: i.params?.sliderPos?.value?.toFixed(3),
      }))
    };
  });
  console.log('=== After slider drag ===');
  console.log(JSON.stringify(status2, null, 2));

  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-0814-quick2.png' });
  console.log('Done');
  await browser.close();
})().catch(e => console.error(e));
