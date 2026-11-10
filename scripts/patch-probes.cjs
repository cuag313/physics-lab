const fs = require('fs')
const p = 'src/lab/scenes/OhmsLawScene.jsx'
let t = fs.readFileSync(p, 'utf8')

const start = t.indexOf('      const col = key === \'R\' ? \'#e53935\' : \'#1c1f22\'')
const end = t.indexOf('      // 吸附状态')
if (start < 0 || end < 0) { console.error('markers not found', start, end); process.exit(1) }

const newDraw = `      const col = key === 'R' ? '#e85d4c' : '#2b2f33'
      const grip = key === 'R' ? '#f07360' : '#3d4348'
      const dx = p.x - jx, dy = p.y - jy
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len
      // PhET 风格：线弧更弯更粗，像真实表笔线
      const sag = Math.min(36, 18 + len * 0.18)
      const mx = (jx + p.x) / 2 + (-uy) * sag
      const my = (jy + p.y) / 2 + (ux) * sag
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.moveTo(jx, jy); ctx.quadraticCurveTo(mx, my, p.x, p.y); ctx.stroke()
      ctx.strokeStyle = col; ctx.lineWidth = 3.6
      ctx.beginPath(); ctx.moveTo(jx, jy); ctx.quadraticCurveTo(mx, my, p.x, p.y); ctx.stroke()
      ctx.lineCap = 'butt'
      // 大探针笔：长金属尖 + 粗笔杆（PhET 电压表造型）
      const ang = Math.atan2(p.y - my, p.x - mx)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang)
      // 金属尖
      const tipGrad = ctx.createLinearGradient(0, -3, 18, 3)
      tipGrad.addColorStop(0, '#f5f7fa'); tipGrad.addColorStop(1, '#9aa7b0')
      ctx.fillStyle = tipGrad; ctx.strokeStyle = '#6d7a82'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(20, -4.2); ctx.lineTo(20, 4.2); ctx.closePath(); ctx.fill(); ctx.stroke()
      // 护套
      ctx.fillStyle = '#c5ced4'; ctx.strokeStyle = '#8a969e'
      ctx.beginPath(); ctx.roundRect(-2, -5.5, 10, 11, 2); ctx.fill(); ctx.stroke()
      // 笔杆
      ctx.fillStyle = grip; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.roundRect(-28, -7.5, 28, 15, 7); ctx.fill(); ctx.stroke()
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.beginPath(); ctx.roundRect(-24, -5.2, 18, 3.2, 2); ctx.fill()
      // 尾部线套
      ctx.fillStyle = '#222'
      ctx.beginPath(); ctx.roundRect(-34, -3.5, 8, 7, 3); ctx.fill()
      ctx.restore()
`

t = t.slice(0, start) + newDraw + t.slice(end)

// 笔尖命中再放大一点
t = t.split('Math.hypot(x - p.x, y - p.y) <= 24').join('Math.hypot(x - p.x, y - p.y) <= 28')

fs.writeFileSync(p, t)
console.log('probes redesigned')
