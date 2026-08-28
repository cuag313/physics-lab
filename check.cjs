const fs = require('fs');
const dir = 'src/components/experiments';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));
const issues = [];
for (const f of files) {
  const c = fs.readFileSync(dir + '/' + f, 'utf8');
  if (c.includes('THREE.') && !c.includes("import * as THREE")) {
    issues.push(f + ': uses THREE but missing import');
  }
  if (!c.includes('export default')) {
    issues.push(f + ': missing default export');
  }
  // Check for 'delta' used outside useFrame scope
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('useFrame')) {
      // Check if callback params include state but code uses state.clock
      const match = line.match(/useFrame\(\(([^)]*)\)/);
      if (match) {
        const params = match[1];
        const block = lines.slice(i, Math.min(i+10, lines.length)).join('\n');
        if (block.includes('state.clock') && !params.includes('state')) {
          issues.push(f + ':' + (i+1) + ' uses state.clock but state not in params');
        }
      }
    }
  }
}
issues.forEach(i => console.log(i));
if (issues.length === 0) console.log('All files look OK');
