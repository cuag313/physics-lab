const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components', 'experiments');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

for (const file of files) {
  const fp = path.join(dir, file);
  const content = fs.readFileSync(fp, 'utf8');
  const lines = content.split('\n');
  
  // Check each line for a complete import that's inside a multi-line import block
  let inBlock = false;
  let blockStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    
    // Start of multi-line import block
    if (t.match(/^import\s*\{/) && !t.includes('} from')) {
      inBlock = true;
      blockStart = i;
      continue;
    }
    
    // End of multi-line import block
    if (inBlock && t.includes('} from')) {
      inBlock = false;
      continue;
    }
    
    // Inside a block: check if this line is a complete import
    if (inBlock && i > blockStart) {
      if (t.match(/^import\s/) && t.includes(' from ')) {
        console.log(`${file} line ${i+1}: ${t.substring(0, 80)}`);
      }
    }
  }
}
