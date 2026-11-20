from PIL import Image
im = Image.open(r'D:\PythonProject\physics-lab\public\assets\equipment\fig\motor_c.png').convert('RGBA')
w, h = im.size
print('size', im.size)
px = im.load()

# 只看图片底部 25% 区域，找深色（黑柱）与暗红（红柱）团块
y0 = int(h * 0.75)
reds, darks = [], []
for y in range(y0, h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a < 200:
            continue
        if r > 110 and g < 70 and b < 80:
            reds.append((x, y))
        if r < 80 and g < 80 and b < 90:
            darks.append((x, y))
for name, pts in (('red', reds), ('dark', darks)):
    if not pts:
        print(name, None)
        continue
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    print(name, 'bbox', min(xs), min(ys), max(xs), max(ys), 'n', len(pts),
          '→ 200x169 卡内', round(min(xs) * 200 / w, 1), round(((min(ys) + max(ys)) / 2) * 169 / h, 1),
          round(max(xs) * 200 / w, 1), round(((min(ys) + max(ys)) / 2) * 169 / h, 1))
