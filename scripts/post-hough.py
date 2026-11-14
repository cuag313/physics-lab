"""用 Hough 圆找柱帽顶沿，给出相对命中点的偏移（crop 为 4 倍、以命中点为中心）
用法：python scripts/post-hough.py
"""
import glob
import json
import os

import cv2
import numpy as np

DPR = 4
BASE = r"audit\fidelity"
meta = json.load(open(os.path.join(BASE, "clean-meta.json"), encoding="utf-8"))

print(f"{'柱':26s}{'圆心(偏移)':>18s}{'r':>8s}{'命中数':>8s}")
for fname, info in sorted(meta.items()):
    p = os.path.join(BASE, fname)
    if not os.path.exists(p):
        continue
    im = cv2.imread(p)
    if im is None:
        continue
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 1.2)
    h, w = gray.shape
    circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=w / 3,
                               param1=90, param2=26,
                               minRadius=int(6 * DPR), maxRadius=int(14 * DPR))
    tag = f"{info['type']}/{info['tid']}"
    if circles is None:
        print(f"{tag:26s}{'未找到':>18s}")
        continue
    cs = np.round(circles[0]).astype(int)
    # 取离 crop 中心最近的圆
    cs = sorted(cs, key=lambda c: (c[0] - w / 2) ** 2 + (c[1] - h / 2) ** 2)
    c = cs[0]
    dx = (c[0] - w / 2) / DPR
    dy = (c[1] - h / 2) / DPR
    print(f"{tag:26s}{f'({dx:+.1f},{dy:+.1f})':>18s}{c[2]:>8d}{len(cs):>8d}")
