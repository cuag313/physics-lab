const fs = require('fs');
let code = fs.readFileSync('src/lab/scenes/VoltAmpereResistorScene.jsx', 'utf8');

const startMarker = '  // ─── 实物器材绘制';
const startIdx = code.indexOf(startMarker);
if (startIdx === -1) { console.log('ERROR: start marker not found'); process.exit(1); }

const afterFunc = code.indexOf('\n  // ─── 导线', startIdx);
if (afterFunc === -1) { console.log('ERROR: end marker not found'); process.exit(1); }

const newCode = `
  // ═══════════════════════════════════════════
  //  Canvas2D实物器材绘制
  // ═══════════════════════════════════════════
  function drawBattery2D(ctx, V) {
    const grd = ctx.createLinearGradient(-38, -18, 38, 18)
    grd.addColorStop(0, '#4CAF50'); grd.addColorStop(0.5, '#66BB6A'); grd.addColorStop(1, '#2E7D32')
    ctx.fillStyle = grd; ctx.strokeStyle = '#1B5E20'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.roundRect(-44, -6, 8, 12, 2); ctx.fill()
    ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.roundRect(36, -6, 8, 12, 2); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('干电池', 0, -3); ctx.fillText(V + 'V', 0, 9)
    ctx.fillStyle = '#E53935'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('+', 46, 0)
    ctx.fillStyle = '#fff'; ctx.fillText('\\u2212', -46, 0)
  }

  function drawSwitch2D(ctx, closed) {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-24, -12, 48, 24, 4); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(-20, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(20, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.lineWidth = 3; ctx.lineCap = 'round'
    if (closed) {
      ctx.strokeStyle = '#4CAF50'
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.stroke()
      ctx.fillStyle = '#4CAF50'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('ON', 0, 14)
    } else {
      ctx.strokeStyle = '#F44336'
      ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(12, -16); ctx.stroke()
      ctx.fillStyle = '#F44336'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('OFF', 0, 14)
    }
    ctx.lineCap = 'butt'
  }

  function drawMeter2D(ctx, type, needleAngle, reading, color) {
    const r = 26
    ctx.fillStyle = '#FAFAFA'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.8
    for (let i = 0; i <= 10; i++) {
      const a = (210 + i * 12) * Math.PI / 180, len = i % 5 === 0 ? 7 : 4
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2))
      ctx.lineTo(Math.cos(a) * (r - 2 - len), Math.sin(a) * (r - 2 - len)); ctx.stroke()
    }
    ctx.fillStyle = color; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(type, 0, 6)
    const clamped = Math.min(Math.max(needleAngle, 0), 1)
    const a = (210 + clamped * 120) * Math.PI / 180
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5)); ctx.stroke(); ctx.lineCap = 'butt'
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill()
    if (reading) { ctx.fillStyle = '#333'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(reading, 0, r - 3) }
    ctx.fillStyle = '#E53935'; ctx.beginPath(); ctx.arc(-r - 5, 0, 3.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(r + 5, 0, 3.5, 0, Math.PI * 2); ctx.fill()
  }

  function drawRheostat2D(ctx, R, maxR) {
    ctx.fillStyle = '#EFEBE9'; ctx.strokeStyle = '#8D6E63'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-38, -18, 76, 36, 4); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = '#795548'; ctx.lineWidth = 1.5
    for (let i = 0; i < 6; i++) { const x = -28 + i * 10; ctx.beginPath(); ctx.arc(x, 0, 6, Math.PI, 0); ctx.stroke() }
    const ratio = R / maxR, sliderX = -30 + ratio * 60
    ctx.fillStyle = '#546E7A'; ctx.strokeStyle = '#37474F'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(sliderX, -22); ctx.lineTo(sliderX - 6, -18); ctx.lineTo(sliderX + 6, -18); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#BDBDBD'; ctx.strokeStyle = '#757575'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(-36, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(36, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#333'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(R + '\\u03A9', 0, 20)
  }

  function drawBulb2D(ctx, brightness) {
    const r = 16
    const levels = [
      { min: 0, bg: '#f0f0f0', fg: '#bbb', glow: 0 },
      { min: 0.15, bg: '#FFFDE7', fg: '#E0C860', glow: 0.12 },
      { min: 0.3, bg: '#FFF9C4', fg: '#D4A800', glow: 0.25 },
      { min: 0.5, bg: '#FFF59D', fg: '#C68A00', glow: 0.45 },
      { min: 0.7, bg: '#FFEE58', fg: '#B76000', glow: 0.65 },
      { min: 0.85, bg: '#FFEB3B', fg: '#E65100', glow: 0.85 },
    ]
    let lv = levels[0]; for (const l of levels) { if (brightness >= l.min) lv = l }
    if (lv.glow > 0) {
      const glow = ctx.createRadialGradient(0, -4, r * 0.5, 0, -4, r * 2.5)
      glow.addColorStop(0, 'rgba(255,235,59,' + (lv.glow * 0.5) + ')'); glow.addColorStop(1, 'rgba(255,235,59,0)')
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -4, r * 2.5, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = '#999'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, -4 - r); ctx.lineTo(0, -36); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, -4 + r + 10); ctx.lineTo(0, 36); ctx.stroke()
    ctx.fillStyle = lv.bg; ctx.beginPath(); ctx.arc(0, -4, r, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -4, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = lv.fg; ctx.lineWidth = 1.5; const s = r * 0.5
    ctx.beginPath(); ctx.moveTo(-s, -4 - s); ctx.lineTo(s, -4 + s); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(s, -4 - s); ctx.lineTo(-s, -4 + s); ctx.stroke()
    ctx.fillStyle = '#9E9E9E'; ctx.strokeStyle = '#616161'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(-8, -4 + r, 16, 10, 2); ctx.fill(); ctx.stroke()
  }

  // ─── 实物器材绘制（Canvas2D版本）───
  function drawComp(ctx, comp, s, I, UR) {
    const { x, y, type } = comp, on = s.switchClosed
    ctx.save(); ctx.translate(x, y); if (s.dragId === comp.id) ctx.globalAlpha = 0.6

    if (type === 'battery') drawBattery2D(ctx, s.U_source)
    else if (type === 'switch') drawSwitch2D(ctx, comp.closed !== false)
    else if (type === 'ammeter') drawMeter2D(ctx, 'A', s.needleA, on ? I.toFixed(3) + 'A' : '', '#E53935')
    else if (type === 'voltmeter') drawMeter2D(ctx, 'V', s.needleV, on ? UR.toFixed(2) + 'V' : '', '#4CAF50')
    else if (type === 'rheostat') drawRheostat2D(ctx, s.sliderR, 50)
    else if (type === 'bulb') {
      const brightness = on ? Math.max(0.08, (I * I * s.R_true) / ((s.U_source / s.R_true) ** 2 * s.R_true)) : 0
      drawBulb2D(ctx, brightness)
    }

    ctx.globalAlpha = 1; ctx.restore()

    // 接线柱热点（悬停高亮）
    const offsets = TERM_OFF[type] || [{ x: -30, y: 0 }, { x: 30, y: 0 }]
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i]
      const hov = s.hoverTerm && s.hoverTerm.compId === comp.id && s.hoverTerm.termIdx === i
      const snap = s.connecting && hov
      if (snap) { ctx.fillStyle = 'rgba(76,175,80,0.3)'; ctx.beginPath(); ctx.arc(x + off.x, y + off.y, 12, 0, Math.PI * 2); ctx.fill() }
      else if (hov) { ctx.fillStyle = 'rgba(255,152,0,0.25)'; ctx.beginPath(); ctx.arc(x + off.x, y + off.y, 10, 0, Math.PI * 2); ctx.fill() }
    }
  }
`;

code = code.substring(0, startIdx) + newCode + code.substring(afterFunc);
fs.writeFileSync('src/lab/scenes/VoltAmpereResistorScene.jsx', code);
console.log('OK: drawComp replaced with Canvas2D version');
