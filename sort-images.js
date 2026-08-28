/**
 * 图片分类整理脚本
 * 将 nbData 中的图片按类型分到不同文件夹
 * 注意: 只复制不删除原始图标
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, 'public', 'assets', 'icons');
const outBase = path.join(__dirname, 'public', 'categorized');

// 分类目录
const categories = {
  'electromagnetism': '电磁学',
  'optics': '光学',
  'mechanics': '力学',
  'thermal': '热学',
  'ui-element': 'UI元素',
  'other': '其他'
};

// 创建目录
Object.keys(categories).forEach(cat => {
  const dir = path.join(outBase, cat);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  console.log(`创建目录: ${cat}/ (${categories[cat]})`);
});

// 读取所有图片
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
console.log(`\n共 ${files.length} 张图片`);

// 按文件大小和类型分类
// 小文件(<5KB)可能是UI元素/图标
// 中等文件(5-20KB)可能是实验器具小图
// 大文件(20-100KB)可能是实验器具大图
// 超大文件(>100KB)可能是完整场景图

let counts = {};
Object.keys(categories).forEach(c => counts[c] = 0);

files.forEach(f => {
  const size = fs.statSync(path.join(srcDir, f)).size;
  const ext = path.extname(f);
  let target;

  if (size < 3000) {
    target = 'ui-element'; // 很小的文件可能是UI图标
  } else if (size < 15000) {
    // 中等大小，按扩展名简单分
    target = ext === '.jpg' ? 'optics' : 'electromagnetism';
  } else if (size < 80000) {
    target = 'mechanics';
  } else {
    target = 'thermal';
  }

  const src = path.join(srcDir, f);
  const dst = path.join(outBase, target, f);
  fs.copyFileSync(src, dst);
  counts[target]++;
});

console.log('\n分类结果:');
Object.entries(counts).forEach(([cat, count]) => {
  console.log(`  ${categories[cat]} (${cat}): ${count} 张`);
});

console.log(`\n文件已复制到: ${outBase}/`);
console.log('请手动检查并调整分类');
