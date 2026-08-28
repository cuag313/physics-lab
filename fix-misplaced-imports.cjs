const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components', 'experiments');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

let totalFixed = 0;

for (const file of files) {
  const fp = path.join(dir, file);
  const content = fs.readFileSync(fp, 'utf8');
  const lines = content.split('\n');
  
  // Step 1: 找多行import块范围
  const blockRanges = [];
  let inBlock = false;
  let blockStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    
    // 开始块：import { 且行内没有 } from
    if (!inBlock && t.match(/^import\s*\{/) && !t.includes('} from')) {
      inBlock = true;
      blockStart = i;
      continue;
    }
    
    // 结束块：行内有 } from（且不是同时开始新块的行）
    if (inBlock && t.includes('} from') && !t.match(/^import\s*\{/)) {
      blockRanges.push([blockStart, i]);
      inBlock = false;
    }
  }
  
  if (blockRanges.length === 0) continue;
  
  // Step 2: 在块范围内找嵌入的完整import行
  const toRemove = new Set();
  const toAdd = [];
  
  for (const [start, end] of blockRanges) {
    for (let i = start + 1; i < end; i++) {
      const t = lines[i].trim();
      // 完整的单行import: import X from '...' 或 import { X } from '...'
      if (t.match(/^import\s/) && t.includes(' from ') && t.includes("'")) {
        toRemove.add(i);
        toAdd.push(lines[i]);
      }
    }
  }
  
  if (toRemove.size === 0) continue;
  
  // Step 3: 删除嵌入行，在块后插入
  const newLines = lines.filter((_, i) => !toRemove.has(i));
  let insertAt = 0;
  for (let i = 0; i < newLines.length; i++) {
    if (newLines[i].includes('} from')) insertAt = i + 1;
  }
  newLines.splice(insertAt, 0, ...toAdd);
  
  fs.writeFileSync(fp, newLines.join('\n'), 'utf8');
  console.log(`✅ ${file}: moved ${toRemove.size} import(s)`);
  totalFixed++;
}

console.log(`\nDone! Fixed ${totalFixed} files.`);
