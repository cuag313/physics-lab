"""把 motor_c.png 里"第 6 个孔"从实心黑改回真镂空（alpha=0）。

背景：这只孔在照片里之所以是黑的，是因为轮子后面正好立着黑色支撑柱——轮子转过去时，
那只孔就会看到黑柱子；孔本身和另外 5 只一样是通透的。原来它被烤成了不透明黑，
跟着轮盘转也不会变，用户一眼看出"有一个孔永远是黑的"。

孔位：6 孔等分在轮心 (74.4,70.5)、半径 33.5 的圈上，缺的那只在 90° 方向 ⇒ 中心 (74.4,103.8)；
另外 5 只的 alpha=0 面积都对应 r≈8.6，这里按同一半径挖掉（留 1px 边缘当孔的暗口）。
"""
from PIL import Image
import math

SRC = 'public/assets/equipment/fig/motor_c.png'
im = Image.open(SRC).convert('RGBA')
px = im.load()
cx, cy, r = 74.4, 103.8, 8.55
n = 0
for y in range(int(cy - 12), int(cy + 13)):
    for x in range(int(cx - 12), int(cx + 13)):
        if math.hypot(x - cx, y - cy) <= r:
            if px[x, y][3] != 0:
                px[x, y] = (0, 0, 0, 0)
                n += 1
print('cleared px', n)
im.save(SRC)
