const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components', 'experiments');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

const importMap = {
  useFrame: { from: '@react-three/fiber', named: true },
  Text: { from: '@react-three/drei', named: true },
  Float: { from: '@react-three/drei', named: true },
  Stars: { from: '@react-three/drei', named: true },
  OrbitControls: { from: '@react-three/drei', named: true },
  THREE: { from: 'three', default: true, name: 'THREE' },
  SciFiEnvironment: { from: '../common/LabEnvironment', named: true },
  LabEnvironment: { from: '../common/LabEnvironment', named: true },
};

let totalFixed = 0;

for (const file of files) {
  const fp = path.join(dir, file);
  let content = fs.readFileSync(fp, 'utf8');
  const newImports = [];

  for (const [symbol, cfg] of Object.entries(importMap)) {
    const regex = new RegExp(`\\b${symbol}\\b`);
    const importRegex = new RegExp(`import.*\\b${symbol}\\b.*from`);
    
    if (regex.test(content) && !importRegex.test(content)) {
      if (cfg.default) {
        newImports.push(`import ${cfg.name} from '${cfg.from}'`);
      } else {
        newImports.push(`import { ${symbol} } from '${cfg.from}'`);
      }
    }
  }

  if (newImports.length > 0) {
    // Find the FIRST import line (not inside a block)
    const lines = content.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith('import ') && !t.startsWith('import {') || 
          (t.startsWith('import {') && t.includes('} from'))) {
        insertAt = i;
        break;
      }
      if (t.startsWith('import {')) {
        // Multi-line import, find the end
        let j = i;
        while (j < lines.length && !lines[j].includes('} from')) j++;
        insertAt = j + 1;
        break;
      }
    }
    
    lines.splice(insertAt, 0, ...newImports);
    content = lines.join('\n');
    fs.writeFileSync(fp, content, 'utf8');
    console.log(`✅ ${file}: added ${newImports.join(', ')}`);
    totalFixed++;
  }
}

console.log(`\nDone! Fixed ${totalFixed} files.`);
