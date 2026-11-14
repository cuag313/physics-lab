"""接线柱热点核对：在 6 倍渲染图里找柱帽质心，与名义 terminal 坐标比较
用法：先 node scripts/shot-term-audit.cjs 出图，再 python scripts/term-offsets.py
"""
from PIL import Image
import numpy as np
import os

S, OX, OY = 6, 14, 10
ITEMS = {
    "battery": (150, 46, [("n", 25, 28), ("p", 134, 28)]),
    "bulb": (176, 83, [("a", 28, 56), ("b", 151, 56)]),
    "switch": (176, 110, [("a", 26, 82), ("b", 151, 82)]),
    "ammeter": (130, 152, [("neg", 31, 110), ("mid", 65, 110), ("full", 100, 110)]),
    "voltmeter": (130, 133, [("neg", 29, 104), ("mid", 63, 104), ("full", 101, 104)]),
    "rheostat": (190, 79, [("tl", 5, 5), ("tr", 184, 5), ("bl", 16, 38.5), ("br", 174, 38)]),
}
BASE = r"audit\fidelity"


def centroid(wm, x0, y0):
    tot = wm.sum()
    if tot < 1:
        return None, 0
    ys, xs = np.mgrid[0:wm.shape[0], 0:wm.shape[1]]
    return ((x0 + (xs * wm).sum() / tot, y0 + (ys * wm).sum() / tot), tot)


for key, (w, h, terms) in ITEMS.items():
    p = os.path.join(BASE, f"term-{key}.png")
    if not os.path.exists(p):
        print("MISS", p)
        continue
    im = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
    print(f"== {key} ({w}x{h}) 图 {im.shape[1]}x{im.shape[0]}")
    for tid, tx, ty in terms:
        cx, cy = OX + S * tx, OY + S * ty
        rx, ry = S * 15, S * 13
        x0, x1 = max(0, int(cx - rx)), min(im.shape[1], int(cx + rx))
        y0, y1 = max(0, int(cy - ry)), min(im.shape[0], int(cy + ry))
        win = im[y0:y1, x0:x1]
        R, G, B = win[..., 0], win[..., 1], win[..., 2]
        V = win.max(axis=2)
        Sa = (win.max(axis=2) - win.min(axis=2)) / np.maximum(V, 1)
        wred = np.clip(R - G - 25, 0, None) + np.clip(R - B - 25, 0, None)
        wdark = np.clip(95 - V, 0, None) * (Sa < 0.32)
        cr, tr = centroid(wred, x0, y0)
        cd, td = centroid(wdark, x0, y0)

        def disp(c):
            return None if c is None else (round((c[0] - OX) / S, 1), round((c[1] - OY) / S, 1))

        print(f"   {tid}: 名义({tx},{ty}) 红={disp(cr)} w={int(tr)}  暗={disp(cd)} w={int(td)}")
