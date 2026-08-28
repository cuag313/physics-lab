const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true, args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // 目录页截图
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-catalog.png' });
  console.log('Catalog screenshot saved');

  // 点击欧姆定律实验
  await page.evaluate(() => {
    const cards = document.querySelectorAll('div');
    for (const card of cards) {
      if (card.textContent.includes('欧姆定律') && card.textContent.includes('点击进入')) {
        card.click();
        return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // 实验台截图
  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-ohm-experiment.png' });
  console.log('Experiment screenshot saved');

  // 检查电路状态
  const status = await page.evaluate(() => {
    const scene = window.__labScene;
    if (!scene) return 'no scene';
    return {
      instruments: scene.instruments.filter(i => i.type !== 'wire').length,
      wires: scene.wires.length,
      valid: scene.circuitEngine?.valid,
      current: scene.instruments.find(i => i.type === 'ammeter')?.current?.toFixed(3),
      brightness: scene.instruments.find(i => i.type === 'bulb')?.state?.brightness?.toFixed(3),
    };
  });
  console.log('Status:', JSON.stringify(status));

  await browser.close();
})().catch(e => console.error(e));
