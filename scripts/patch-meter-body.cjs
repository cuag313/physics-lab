const fs = require('fs')
const p = 'src/lab/ui/circuitKit.js'
let t = fs.readFileSync(p, 'utf8')

const startMarker = 'export function drawRealMultimeter(ctx, x, y, opts = {}) {'
const endMarker = '/** 万用表表笔插孔（表笔线起点，元件局部坐标）：红在左、黑在右 */'
const start = t.indexOf(startMarker)
const end = t.indexOf(endMarker)
if (start < 0 || end < 0) { console.error('markers missing', start, end); process.exit(1) }

const fn = `export function drawRealMultimeter(ctx, x, y, opts = {}) {
  const { mode = 'V', value = 0, scale = 1.15 } = opts
  const W = 88, H = 78
  const live = value != null          // null = 表笔未就位，读数显示 —
  ctx.save(); ctx.translate(x, y)
  if (scale !== 1) ctx.scale(scale, scale)

  // PhET 风格：橙黄圆壳 + 深色描边
  const bodyGrad = ctx.createLinearGradient(0, -H / 2, 0, H / 2)
  bodyGrad.addColorStop(0, '#ffb74d')
  bodyGrad.addColorStop(0.45, '#ff9800')
  bodyGrad.addColorStop(1, '#f57c00')
  ctx.fillStyle = bodyGrad
  ctx.strokeStyle = '#5d4037'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(-W / 2, -H / 2, W, H, 22)
  ctx.fill(); ctx.stroke()

  // 顶部高光
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.beginPath(); ctx.roundRect(-W / 2 + 10, -H / 2 + 8, W - 20, 14, 8); ctx.fill()

  // 档位标题（PhET 大字「电压」）
  ctx.fillStyle = '#4e342e'
  ctx.font = 'bold 13px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(mode === 'A' ? '电流' : '电压', 0, -18)

  // 读数窗：白底圆角 + 大数字
  const rw = 62, rh = 24
  ctx.fillStyle = '#fffef7'
  ctx.strokeStyle = '#8d6e63'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.roundRect(-rw / 2, -6, rw, rh, 8); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#3e2723'
  ctx.font = 'bold 16px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  if (live) {
    const txt = mode === 'A' ? (value || 0).toFixed(3) : (value || 0).toFixed(2)
    ctx.fillText(txt, 0, 6)
    ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#6d4c41'
    ctx.fillText(mode === 'A' ? 'A' : 'V', rw / 2 - 8, 6)
  } else {
    ctx.fillText('—', 0, 4)
  }

  // V / A 小按钮（轻点整表仍可切换，这里作视觉提示）
  ctx.font = 'bold 10px sans-serif'
  ctx.fillStyle = mode === 'V' ? '#fff' : 'rgba(62,39,35,0.55)'
  ctx.beginPath(); ctx.roundRect(-34, 26, 28, 16, 8); ctx.fill()
  if (mode === 'V') { ctx.fillStyle = '#e65100'; ctx.beginPath(); ctx.roundRect(-34, 26, 28, 16, 8); ctx.fill(); ctx.fillStyle = '#fff' }
  ctx.fillText('V', -20, 34)
  ctx.fillStyle = mode === 'A' ? '#e65100' : 'rgba(62,39,35,0.55)'
  ctx.beginPath(); ctx.roundRect(6, 26, 28, 16, 8); ctx.fill()
  ctx.fillStyle = mode === 'A' ? '#fff' : 'rgba(62,39,35,0.55)'
  ctx.fillText('A', 20, 34)

  // 底部线出口 + 红黑插孔
  for (const [px, col, dk, label] of [[-22, '#e53935', '#b71c1c', '＋'], [22, '#212121', '#000', '－']]) {
    ctx.fillStyle = '#8d6e63'
    ctx.beginPath(); ctx.roundRect(px - 7, H / 2 - 14, 14, 14, 4); ctx.fill()
    ctx.fillStyle = col; ctx.strokeStyle = dk; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.arc(px, H / 2 - 8, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(label, px, H / 2 - 8)
  }

  ctx.restore()
}

`

t = t.slice(0, start) + fn + t.slice(end)
fs.writeFileSync(p, t)
console.log('multimeter body redesigned')
