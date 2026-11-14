"""在干净 crop 上做"局部"柱帽定位：只在命中点周围 ±12 显示像素的窗口里找最深/最红的紧凑块，
取 bbox 中心当柱帽中心。柱帽和底板对比度高时这一步比全图检测可靠。
用法：python scripts/post-local.py
"""
import json
import os

import cv2
import numpy as np

DPR = 4
BASE = r"audit\fidelity"
meta = json.load(open(os.path.join(BASE, "clean-meta.json"), encoding="utf-8"))


def blob_center(im, win, mode):
    """win: (x0,y0,x1,y1) 像素窗口；返回窗口内 blob 的 bbox 中心（crop 像素坐标）"""
    x0, y0, x1, y1 = win
    sub = im[y0:y1, x0:x1]
    R, G, B = sub[..., 0], sub[..., 1], sub[..., 2]
    V = sub.max(axis=2)
    S = (sub.max(axis=2) - sub.min(axis=2)) / np.maximum(V, 1)
    if mode == "red":
        mask = ((R > 85) & (R - G > 35) & (R - B > 35)).astype(np.uint8)
    else:
        mask = ((V < 72) & (S < 0.34)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n < 2:
        return None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, a = st[i]
    if a < 400:          # 4 倍图里一个柱帽至少 400 像素
        return None
    return (x0 + x + w / 2, y0 + y + h / 2, a, w, h)


print(f"{'柱':22s}{'现坐标':>13s}{'量到':>13s}{'偏差':>12s}  宽高")
for fname, info in sorted(meta.items()):
    p = os.path.join(BASE, fname)
    if not os.path.exists(p):
        continue
    im = cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB).astype(np.float32)
    h, w = im.shape[:2]
    cx = w / 2 + (info["tx"] - info["cx"]) * DPR
    cy = h / 2 + (info["ty"] - info["cy"]) * DPR
    win = (int(max(0, cx - 48)), int(max(0, cy - 48)), int(min(w, cx + 48)), int(min(h, cy + 48)))
    best = None
    for mode in ("red", "dark"):
        b = blob_center(im, win, mode)
        if b:
            best = (mode, b)
            break
    tag = f"{info['type']}/{info['tid']}"
    if not best:
        print(f"{tag:22s}{'':13s}{'未找到':>13s}")
        continue
    mode, (bx, by, a, bw, bh) = best
    dx = (bx - w / 2) / DPR
    dy = (by - h / 2) / DPR
    rx = info["cx"] + dx
    ry = info["cy"] + dy
    print(f"{tag:22s}{f'({info[chr(116)+chr(120)]},{info[chr(116)+chr(121)]})':>13s}"
          f"{f'({rx:.1f},{ry:.1f})':>13s}{f'({rx-info[chr(116)+chr(120)]:+.1f},{ry-info[chr(116)+chr(121)]:+.1f})':>12s}"
          f"  {mode} {bw}x{bh}")
