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

  // 点击"凸透镜成像"
  await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.textContent.includes('凸透镜成像') && el.textContent.includes('点击进入') && el.children.length < 8) {
        el.click();
        return true;
      }
    }
    // 试试光学分类
    const spans = document.querySelectorAll('span');
    for (const s of spans) {
      if (s.textContent.trim() === '光学') { s.parentElement.click(); return true; }
    }
    return false;
  });
  await new Promise(r => setTimeout(r, 1500));

  // 再点击凸透镜成像
  await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.textContent.includes('凸透镜成像') && el.textContent.includes('点击进入')) {
        el.click();
        return true;
      }
    }
    return false;
  });
  await new Promise(r => setTimeout(r, 2000));

  // 检查状态
  const status = await page.evaluate(() => {
    const scene = window.__labScene;
    if (!scene) return { error: 'no scene' };
    return {
      instruments: scene.instruments.filter(i => i.type !== 'wire').map(i => ({
        type: i.type, x: i.x.toFixed(2), y: i.y.toFixed(2)
      })),
      opticsRays: scene.getOpticsRays?.()?.length ?? 0,
    };
  });
  console.log('Status:', JSON.stringify(status, null, 2));

  await page.screenshot({ path: 'D:\\PythonProject\\physics-lab\\test-lens.png' });
  console.log('Screenshot saved');
  await browser.close();
})().catch(e => console.error(e));
