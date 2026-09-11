const fs = require('fs');
let code = fs.readFileSync('src/lab/scenes/VoltAmpereResistorScene.jsx', 'utf8');

// 1. 替换checkCircuit函数（加伏特表串联/安培表并联检测）
const startMarker = '  function checkCircuit(s) {';
const startIdx = code.indexOf(startMarker);
if (startIdx === -1) { console.log('ERROR: checkCircuit not found'); process.exit(1); }

// 找到函数结束（下一个顶层函数注释或空行+function）
let braceCount = 0, endIdx = -1;
for (let i = startIdx; i < code.length; i++) {
  if (code[i] === '{') braceCount++;
  if (code[i] === '}') braceCount--;
  if (braceCount === 0) { endIdx = i + 1; break; }
}
if (endIdx === -1) { console.log('ERROR: checkCircuit end not found'); process.exit(1); }

const newCheckCircuit = `  function checkCircuit(s) {
    s.wireErrors = []; const comps = s.components, wires = s.wires, adj = {}
    for (const c of comps) adj[c.id] = new Set()
    for (const w of wires) { adj[w.from.compId]?.add(w.to.compId); adj[w.to.compId]?.add(w.from.compId) }
    if (!comps.some(c => c.type === 'battery')) { s.circuitStatus = { ok: false, reason: '缺少电源' }; return }
    if (!comps.some(c => c.type === 'bulb')) { s.circuitStatus = { ok: false, reason: '缺少灯泡' }; return }
    const unconn = comps.filter(c => !adj[c.id] || adj[c.id].size === 0)
    if (unconn.length > 0) { s.circuitStatus = { ok: false, reason: unconn.map(c => c.type).join('、') + '未连接' }; return }
    const bat = comps.find(c => c.type === 'battery'), vis = new Set(); let hasLoop = false
    ;(function dfs(n, d) { if (d > 0 && n === bat.id) { hasLoop = true; return }; if (vis.has(n) || d > comps.length + 2) return; vis.add(n); for (const nx of adj[n] || []) dfs(nx, d + 1) })(bat.id, 0)
    if (!hasLoop) { s.circuitStatus = { ok: false, reason: '断路：未形成闭合回路' }; return }
    for (const w of wires) { if (w.from.compId === bat.id && w.to.compId === bat.id) { s.wireErrors.push({ wireId: w.id }); s.circuitStatus = { ok: false, reason: '短路！' }; return } }

    // 伏特表串联检测：去掉伏特表后回路断开→断路
    const voltmeter = comps.find(c => c.type === 'voltmeter')
    if (voltmeter && adj[voltmeter.id]?.size > 0) {
      const adj2 = {}; for (const c of comps) adj2[c.id] = new Set()
      for (const w of wires) { if (w.from.compId === voltmeter.id || w.to.compId === voltmeter.id) continue; adj2[w.from.compId]?.add(w.to.compId); adj2[w.to.compId]?.add(w.from.compId) }
      const vis2 = new Set(); let loop2 = false
      ;(function dfs(n, d) { if (d > 0 && n === bat.id) { loop2 = true; return }; if (vis2.has(n) || d > comps.length + 2) return; vis2.add(n); for (const nx of adj2[n] || []) dfs(nx, d + 1) })(bat.id, 0)
      if (!loop2) { s.circuitStatus = { ok: false, reason: '伏特表串联→断路（应并联在灯泡两端）' }; return }
    }

    // 安培表并联检测：去掉安培表后两邻接元件仍连通→短路
    const ammeter = comps.find(c => c.type === 'ammeter')
    if (ammeter && adj[ammeter.id]?.size >= 2) {
      const adj3 = {}; for (const c of comps) adj3[c.id] = new Set()
      for (const w of wires) { if (w.from.compId === ammeter.id || w.to.compId === ammeter.id) continue; adj3[w.from.compId]?.add(w.to.compId); adj3[w.to.compId]?.add(w.from.compId) }
      const nb = [...adj[ammeter.id]], vis3 = new Set(); let found = false
      ;(function dfs(n) { if (found || n === nb[1]) { found = true; return }; if (vis3.has(n)) return; vis3.add(n); for (const nx of adj3[n] || []) dfs(nx) })(nb[0])
      if (found) { s.circuitStatus = { ok: false, reason: '安培表并联→短路（应串联在电路中）' }; return }
    }

    s.circuitStatus = { ok: true, reason: '电路正常，可以实验' }
  }`;

code = code.substring(0, startIdx) + newCheckCircuit + code.substring(endIdx);

// 2. 修改灯泡接线柱位置（底座两边）
code = code.replace(
  "bulb: [{ x: -30, y: 0 }, { x: 30, y: 0 }],",
  "bulb: [{ x: -20, y: 20 }, { x: 20, y: 20 }],"
);

// 3. 修改drawBulb2D引线到底座两边
code = code.replace(
  `    // 引线（左右）
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-r - 4, -4); ctx.lineTo(-30, 0); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(r + 4, -4); ctx.lineTo(30, 0); ctx.stroke()`,
  `    // 引线（从底座两边引出）
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-10, -4 + r + 10); ctx.lineTo(-20, 20); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(10, -4 + r + 10); ctx.lineTo(20, 20); ctx.stroke()`
);

fs.writeFileSync('src/lab/scenes/VoltAmpereResistorScene.jsx', code);
console.log('OK: checkCircuit + bulb terminals updated');
