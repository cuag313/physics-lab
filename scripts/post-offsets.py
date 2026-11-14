"""从 post-<type>-<tid>.png 里量柱帽真实中心（用最大连通块的 bbox 中心，避开打光偏移）
需要先跑 node scripts/shot-term-audit.cjs 生成 crop 与 post-meta.json。
用法：python scripts/post-offsets.py
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

DPR = 4
BASE = r"audit\fidelity"
meta = json.load(open(os.path.join(BASE, "post-meta.json"), encoding="utf-8"))


def biggest(mask):
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2:
        return None
    ih, iw = mask.shape[:2]
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        # 贴着 crop 边、或占了半个 crop 的块是器材本体/底板，不是柱帽
        if x <= 1 or y <= 1 or x + w >= iw - 1 or y + h >= ih - 1:
            continue
        if a > 0.34 * iw * ih:
            continue
        out.append((x + w / 2, y + h / 2, a, w, h))
    if not out:
        return None
    return max(out, key=lambda t: t[2])


rows = []
for fname, info in sorted(meta.items()):
    p = os.path.join(BASE, fname)
    if not os.path.exists(p):
        continue
    im = np.asarray(Image.open(p).convert("RGB")).astype(np.float32)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    V = im.max(axis=2)
    S = (im.max(axis=2) - im.min(axis=2)) / np.maximum(V, 1)
    red = biggest((R > 90) & (R - G > 40) & (R - B > 40))
    dark = biggest((V < 58) & (S < 0.28))
    # 选"更像柱帽"的那个：面积适中 + 长宽接近
    cand = []
    for tag, b in (("红", red), ("黑", dark)):
        if not b:
            continue
        cx, cy, a, w, h = b
        ar = w / max(h, 1)
        if a > 60 and 0.5 < ar < 2.2:
            cand.append((tag, cx, cy, a, w, h))
    h, w = im.shape[:2]
    if not cand:
        print(f"{info['type']}-{info['tid']}: 无柱帽候选")
        continue
    tag, cx, cy, a, bw, bh = cand[0]
    # crop 内像素 → 显示坐标
    dx = (cx - w / 2) / DPR
    dy = (cy - h / 2) / DPR
    real_x = info["cx"] + dx
    real_y = info["cy"] + dy
    cur_x, cur_y = info["tx"], info["ty"]
    rows.append((info["type"], info["tid"], cur_x, cur_y, round(real_x, 1), round(real_y, 1),
                 round(real_x - cur_x, 1), round(real_y - cur_y, 1), tag, a))

print(f"{'器材':12s}{'柱':5s}{'现坐标':>14s}{'柱帽中心':>14s}{'偏差':>14s}  色")
for r in rows:
    print(f"{r[0]:12s}{r[1]:5s}{f'({r[2]},{r[3]})':>14s}{f'({r[4]},{r[5]})':>14s}"
          f"{f'(+{r[6]},+{r[7]})':>14s}  {r[8]}")
