"""量 motor_c.png 皮带轮：用"6 个镂空孔"的圆心群定出轮心（孔是对称分布，质心即轮心）。
透明孔 = alpha<40 且不与图外背景连通的独立小块（面积 100..3000）。"""
from PIL import Image, ImageDraw
from collections import deque

P = 'public/assets/equipment/fig/motor_c.png'
im = Image.open(P).convert('RGBA')
W, H = im.size
px = im.load()
S = 200.0 / W
print('source', W, H, '-> 200x169 scale', round(S, 5), round(169.0 / H, 5))

hole_mask = set()
for y in range(H):
    for x in range(W):
        if px[x, y][3] < 40:
            hole_mask.add((x, y))

clusters = []
while hole_mask:
    s = next(iter(hole_mask))
    seen = {s}; hole_mask.discard(s); q = deque([s])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n in hole_mask:
                hole_mask.discard(n); seen.add(n); q.append(n)
    xs = [p[0] for p in seen]; ys = [p[1] for p in seen]
    cx = (min(xs) + max(xs)) / 2.0; cy = (min(ys) + max(ys)) / 2.0
    clusters.append((len(seen), cx, cy, min(xs), min(ys), max(xs), max(ys)))

print('透明块共 %d，面积>60 且落左半区（x<150,y<150）的候选：' % len(clusters))
holes = []
for c in sorted(clusters, reverse=True):
    n, cx, cy, x0, y0, x1, y1 = c
    w = x1 - x0 + 1; h = y1 - y0 + 1
    if n > 60 and cx < 150 and cy < 150 and 0.45 < w / h < 2.4:
        holes.append((cx, cy, n, w, h))
        print('   hole src (%.1f, %.1f) n=%d box %dx%d -> 200x169 (%.2f, %.2f)' % (cx, cy, n, w, h, cx * S, cy * S))

# 只保留最像"孔"的一圈：面积相近（>150）的那些
ring = [h for h in holes if h[2] > 150][:6]
print('取孔 %d 个' % len(ring))
if ring:
    ccx = sum(h[0] for h in ring) / len(ring)
    ccy = sum(h[1] for h in ring) / len(ring)
    rr = sum(((h[0] - ccx) ** 2 + (h[1] - ccy) ** 2) ** 0.5 for h in ring) / len(ring)
    print('轮心 src (%.2f, %.2f) r=%.1f -> 200x169 (%.2f, %.2f) r %.1f'
          % (ccx, ccy, rr, ccx * S, ccy * S, rr * S))

out = im.convert('RGB').copy()
d = ImageDraw.Draw(out)
for h in holes:
    d.ellipse([h[0] - 6, h[1] - 6, h[0] + 6, h[1] + 6], outline=(0, 255, 0))
if ring:
    d.ellipse([ccx - 3, ccy - 3, ccx + 3, ccy + 3], fill=(255, 0, 0))
    d.ellipse([ccx - rr, ccy - rr, ccx + rr, ccy + rr], outline=(255, 0, 0))
old = (57.8 / S, 51.4 / S)
d.line([old[0] - 7, old[1], old[0] + 7, old[1]], fill=(0, 220, 255)); d.line([old[0], old[1] - 7, old[0], old[1] + 7], fill=(0, 220, 255))
out.resize((W * 4, H * 4), Image.LANCZOS).save('audit/fidelity/m10-pulley.png')
print('saved')
