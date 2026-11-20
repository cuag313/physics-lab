"""量插座图标里真正镂空的孔位（像素聚类），折成器材卡坐标。
用法：python scripts/_measure_socket.py socket3_face.png 8 60 88 88
"""
import sys
from PIL import Image

f, ox, oy, w, h = sys.argv[1], *map(float, sys.argv[2:6])
th = int(sys.argv[6]) if len(sys.argv) > 6 else 110
path = f'public/assets/equipment/fig/{f}'
im = Image.open(path).convert('RGBA')
W, H = im.size
px = im.load()

dark = set()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a > 200 and (r + g + b) < th:
            dark.add((x, y))

seen = set()
comps = []
for p in dark:
    if p in seen:
        continue
    stack, pts = [p], []
    seen.add(p)
    while stack:
        cx, cy = stack.pop()
        pts.append((cx, cy))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (cx + dx, cy + dy)
                if q in dark and q not in seen:
                    seen.add(q)
                    stack.append(q)
    comps.append(pts)

print(f'{f}  {W}×{H}  drawn {w:g}×{h:g} at ({ox:g},{oy:g})')
res = []
for pts in comps:
    if len(pts) < 40:
        continue
    xs = [q[0] for q in pts]
    ys = [q[1] for q in pts]
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    kx = ox + mx / W * w
    ky = oy + my / H * h
    res.append((my, mx, len(pts), bw, bh, kx, ky))
res.sort()
for my, mx, n, bw, bh, kx, ky in res:
    print(f'  source ({mx:6.1f},{my:6.1f})  area {n:5d}  {bw}×{bh}  → card ({kx:5.1f},{ky:5.1f})')
