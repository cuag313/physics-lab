const fs = require('fs')
// 注释更新
{
  const p = 'src/lab/ui/circuitKit.js'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    ' * 数字万用表实物：黑壳 + LCD 读数 + 档位旋钮 + 红黑表笔插孔',
    ' * 万用表：PhET 风格橙黄圆壳 + 大读数窗 + V/A 按钮提示 + 红黑插孔'
  )
  // 机身盒随壳体放大（88*1.15≈101, 78*1.15≈90）
  t = t.replace(
    'if (Math.abs(dx) <= 52 && Math.abs(dy) <= 42) return c',
    'if (Math.abs(dx) <= 56 && Math.abs(dy) <= 50) return c'
  )
  fs.writeFileSync(p, t)
}
// OhmsLaw 机身优先盒同步
{
  const p = 'src/lab/scenes/OhmsLawScene.jsx'
  let t = fs.readFileSync(p, 'utf8')
  t = t.replace(
    'if (Math.abs(dx) > 52 || Math.abs(dy) > 42) continue',
    'if (Math.abs(dx) > 56 || Math.abs(dy) > 50) continue'
  )
  fs.writeFileSync(p, t)
}
console.log('hit boxes ok')
