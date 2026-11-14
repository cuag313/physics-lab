import sys
from PIL import Image
src = r"D:/PythonProject/physics-lab/audit/fidelity/dissect-on.png"
im = Image.open(src)
print(im.size)
# 2x 截图：comp 坐标在 CSS px，乘 2
regions = {
    "mA":   (369, 704, 150, 150),
    "volt": (955, 714, 130, 130),
    "bulb": (860, 386, 176, 83),
    "batt": (333, 448, 150, 46),
}
for k, (x, y, w, h) in regions.items():
    box = (x * 2 - 20, y * 2 - 20, (x + w) * 2 + 20, (y + h) * 2 + 20)
    c = im.crop(box)
    c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    out = f"D:/PythonProject/physics-lab/audit/fidelity/zoom-dissect-{k}.png"
    c.save(out)
    print(k, c.size, out)
