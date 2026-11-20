from PIL import Image
im = Image.open(r'D:\PythonProject\physics-lab\audit\fidelity\poster-cut.png').convert('RGBA')
w, h = im.size
px = im.load()
print('size', im.size)
xs, ys = [], []
for y in range(0, h, 6):
    for x in range(0, w, 6):
        r, g, b, a = px[x, y]
        if a > 200 and r > 110 and g < 95 and b < 95:
            xs.append(x); ys.append(y)
print('red bbox', (min(xs), min(ys), max(xs), max(ys)) if xs else None)
xs2, ys2 = [], []
for y in range(0, h, 6):
    for x in range(0, w, 6):
        r, g, b, a = px[x, y]
        if a > 200 and b > 150 and r < 90 and g < 130:
            xs2.append(x); ys2.append(y)
print('blue bbox', (min(xs2), min(ys2), max(xs2), max(ys2)) if xs2 else None)
# 透明度：有多少像素是透明的
tp = 0
for y in range(0, h, 6):
    for x in range(0, w, 6):
        if px[x, y][3] < 20:
            tp += 1
print('transparent samples', tp, 'of', (h//6+1)*(w//6+1))
