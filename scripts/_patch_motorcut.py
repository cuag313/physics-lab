import io, sys

path = r'D:\PythonProject\physics-lab\src\lab\simple3d\BuilderSVG.jsx'
with io.open(path, 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')

# 定位 if (it.cut) { ... } 块
start = None
for i, ln in enumerate(lines):
    if ln.strip() == 'if (it.cut) {':
        start = i
        break
assert start is not None, 'not found'
# 找匹配的结束大括号（缩进与 if 相同）
indent = len(lines[start]) - len(lines[start].lstrip())
end = None
for j in range(start + 1, len(lines)):
    ln = lines[j]
    if ln.strip() == '}' and (len(ln) - len(ln.lstrip())) == indent:
        end = j
        break
assert end is not None, 'end not found'
print('replace lines', start + 1, '..', end + 1)
print('first:', repr(lines[start]))
print('last :', repr(lines[end]))

new_block = '''          if (it.cut) {
            /* 剖面 = Motor3D 渲染的机芯图（与「电路演示」同一套真 3D 几何，PNG 由 scripts/_render-motorcut.cjs 出图）：
               磁极有真厚度、中间是真通孔、换向器是立体半环 —— 不再是一张平涂矢量图。
               图是静态的，转向靠右上角的小角标读；电流方向看端环哪片红哪片蓝。 */
            const on = it.v > 0.05
            const brDir = it.dir >= 0 ? 1 : -1
            return (
              <g key={it.id} transform={`translate(${it.x},${it.y})`}>
                {/* 卡片底：盖住下层的实拍图标（导线从卡底边穿进去，读作"接在机内"） */}
                <rect x="2" y="2" width="196" height="165" rx="10" fill="#fffaf1" stroke="#e8dcc6" strokeWidth="1.2" />
                <image href={figURL('motor_cut.png')} x="0" y="0" width="200" height="169" preserveAspectRatio="none" />
                {/* 转向角标：弧箭头逆时针 / 顺时针随接线柱左右对调翻转 */}
                {on && (
                  <g transform="translate(174,27)">
                    <circle r="12" fill="#ffffff" opacity="0.92" stroke="#f59e0b" strokeWidth="1.2" />
                    <g transform={`scale(${brDir},1)`}>
                      <path d="M-5.6 3.0 A 6.8 6.8 0 1 1 5.6 -2.0" fill="none" stroke="#b45309" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M5.6 -2.0 L1.9 -5.2 M5.6 -2.0 L5.9 1.9" fill="none" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" />
                    </g>
                  </g>
                )}
              </g>
            )
          }'''

lines[start:end + 1] = new_block.split('\n')
with io.open(path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
print('done')
