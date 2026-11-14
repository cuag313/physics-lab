"""把每根柱子的干净 crop 放大 2 倍并打上"绝对显示坐标"标尺，便于直接读柱帽中心
用法：python scripts/post-grid.py   （先跑 node scripts/shot-term-audit.cjs）
"""
import json
import os

from PIL import Image, ImageDraw

DPR = 4
ZOOM = 2
BASE = r"audit\fidelity"
meta = json.load(open(os.path.join(BASE, "clean-meta.json"), encoding="utf-8"))

groups = {}
for f, info in meta.items():
    groups.setdefault(info["type"], []).append((info, f))

for typ, items in groups.items():
    tiles = []
    for info, f in sorted(items, key=lambda t: t[0]["tx"]):
        p = os.path.join(BASE, f)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB")
        im = im.resize((im.width * ZOOM, im.height * ZOOM), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        # 竖线：每 2 显示像素一条；每 10 标数字（绝对显示坐标）
        x0 = int(round(info["cx"] - 20))
        for dx in range(x0, x0 + 41, 1):
            px = (dx - info["cx"]) * DPR * ZOOM + im.width / 2
            if px < 0 or px > im.width:
                continue
            heavy = dx % 10 == 0
            d.line([(px, 0), (px, im.height)], fill=(90, 110, 210) if heavy else (205, 210, 235),
                   width=2 if heavy else 1)
            if heavy:
                d.text((px + 2, 2), str(dx), fill=(20, 50, 160))
        y0 = int(round(info["cy"] - 16))
        for dy in range(y0, y0 + 33, 1):
            py = (dy - info["cy"]) * DPR * ZOOM + im.height / 2
            if py < 0 or py > im.height:
                continue
            heavy = dy % 10 == 0
            d.line([(0, py), (im.width, py)], fill=(90, 110, 210) if heavy else (205, 210, 235),
                   width=2 if heavy else 1)
            if heavy:
                d.text((2, py + 1), str(dy), fill=(20, 50, 160))
        # 十字标出当前 terminal
        cx = im.width / 2
        cy = im.height / 2
        d.line([(cx - 10, cy), (cx + 10, cy)], fill=(220, 40, 40), width=3)
        d.line([(cx, cy - 10), (cx, cy + 10)], fill=(220, 40, 40), width=3)
        lab = Image.new("RGB", (im.width, 20), (255, 255, 255))
        ImageDraw.Draw(lab).text((4, 3), f"{typ}/{info['tid']} 现({info['tx']},{info['ty']})", fill=(10, 10, 10))
        canvas = Image.new("RGB", (im.width, im.height + 20), (255, 255, 255))
        canvas.paste(lab, (0, 0))
        canvas.paste(im, (0, 20))
        tiles.append(canvas)
    if not tiles:
        continue
    W = sum(t.width for t in tiles) + 8 * (len(tiles) - 1)
    H = max(t.height for t in tiles)
    sheet = Image.new("RGB", (W, H), (255, 255, 255))
    x = 0
    for t in tiles:
        sheet.paste(t, (x, 0))
        x += t.width + 8
    out = os.path.join(BASE, f"grid-{typ}.png")
    sheet.save(out)
    print("saved", out, sheet.size)
