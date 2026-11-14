"""在读柱帽位置用一张带标尺的放大图（诊断用，产物在 audit/fidelity/）
用法：python scripts/term-ruler.py battery-left  （或 battery-right / bulb-left ...）
"""
import sys
from PIL import Image, ImageDraw

S, OX, OY = 6, 14, 10
ZOOM = 2  # 在 6x 图基础上再放大 2 倍 → 12 倍显示像素


def main():
    key = sys.argv[1] if len(sys.argv) > 1 else "battery-left"
    item, side = key.rsplit("-", 1)
    path = rf"audit\fidelity\term-{item}.png"
    im = Image.open(path).convert("RGB")
    # 该件宽度（display px）
    widths = {"battery": 150, "bulb": 176, "switch": 176, "ammeter": 130, "voltmeter": 130, "rheostat": 190}
    w = widths[item]
    if side == "left":
        x0, x1 = 0, min(52, w)
    elif side == "right":
        x0, x1 = max(0, w - 52), w
    elif side == "mid":
        x0, x1 = max(0, w // 2 - 26), min(w, w // 2 + 26)
    else:
        x0, x1 = max(0, int(side) - 26), min(w, int(side) + 26)
    # 显示坐标 → 裁剪像素
    cx0 = int(OX + S * x0)
    cx1 = int(OX + S * x1)
    box = (cx0, 0, cx1, im.height)
    crop = im.crop(box).resize(((cx1 - cx0) * ZOOM, im.height * ZOOM), Image.LANCZOS)
    d = ImageDraw.Draw(crop)
    for xd in range(x0, x1 + 1, 2):
        px = (OX + S * xd - cx0) * ZOOM
        heavy = xd % 10 == 0
        d.line([(px, 0), (px, crop.height)], fill=(120, 120, 255) if heavy else (200, 200, 255), width=2 if heavy else 1)
        if heavy:
            d.text((px + 3, 2), str(xd), fill=(30, 60, 200))
    for yd in range(0, 46, 4):
        py = (OY + S * yd) * ZOOM
        if py < crop.height:
            d.line([(0, py), (crop.width, py)], fill=(220, 220, 220), width=1)
            d.text((2, py + 1), str(yd), fill=(90, 90, 90))
    out = rf"audit\fidelity\ruler-{key}.png"
    crop.save(out)
    print("saved", out, crop.size)


main()
