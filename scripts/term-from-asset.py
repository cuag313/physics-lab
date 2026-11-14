"""从实拍素材里直接找柱帽（红/黑）质心，换算成器材显示坐标
用法：python scripts/term-from-asset.py
说明：柱帽是圆盘状小块（宽高比接近 1），器材本体是长条或大块，用长宽比 + 面积过滤。
"""
import os

import numpy as np
import cv2
from PIL import Image

FIG = r"public\assets\equipment\fig"

# 器材：素材文件、素材尺寸、显示尺寸（render 里 <image>/photo 的宽高）
ITEMS = {
    "battery": ("battery_c.png", 1024, 288, 150, 42),
    "bulb": ("bulb_c.png", 256, 121, 176, 83),
    "switch": ("switch_c.png", 226, 158, 176, 110),
    "ammeter": ("ammeter_c.png", 118, 138, 130, 152),
    "voltmeter": ("voltmeter_c.png", 248, 253, 130, 133),
    "rheostat": ("rheostat_c2.png", 448, 186, 190, 79),
}


def blobs(mask, min_area):
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, cent = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        a = st[i, cv2.CC_STAT_AREA]
        w = st[i, cv2.CC_STAT_WIDTH]
        h = st[i, cv2.CC_STAT_HEIGHT]
        if a < min_area:
            continue
        ar = w / max(h, 1)
        fill = a / (w * h)
        if 0.45 < ar < 2.1 and fill > 0.35:
            out.append((cent[i][0], cent[i][1], a, w, h))
    return out


for key, (fname, aw, ah, dw, dh) in ITEMS.items():
    p = os.path.join(FIG, fname)
    if not os.path.exists(p):
        print("MISS", p)
        continue
    im = np.asarray(Image.open(p).convert("RGBA")).astype(np.float32)
    alpha = im[..., 3]
    rgb = im[..., :3]
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    V = rgb.max(axis=2)
    S = (rgb.max(axis=2) - rgb.min(axis=2)) / np.maximum(V, 1)
    red = (R > 80) & (R - G > 35) & (R - B > 35) & (alpha > 120)
    dark = (V < 85) & (S < 0.30) & (alpha > 120)
    sx, sy = dw / aw, dh / ah
    print(f"== {key}  素材 {aw}x{ah} → 显示 {dw}x{dh}  scale ({sx:.4f},{sy:.4f})")
    for tag, mask, area in (("红帽", red, aw * ah / 900), ("黑帽", dark, aw * ah / 900)):
        b = blobs(mask, max(120, int(area)))
        b.sort(key=lambda t: -t[2])
        for (cx, cy, a, w, h) in b[:6]:
            print(f"   {tag} 素材({cx:.0f},{cy:.0f}) 面积{int(a)} {w}x{h} → 显示({cx * sx:.1f},{cy * sy:.1f})")
