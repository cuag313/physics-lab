"""逐像素比对：原图 vs 2D 渲染（都把墨迹拆成连通块，按最近的配对报偏差）。
用法：python scripts/diff-m256.py [ammeterA|voltmeter]
只读 audit/fidelity/m256-*.png 与 fig/*.png。
"""
import sys
import numpy as np
import cv2
from PIL import Image

FIG = r"D:\PythonProject\physics-lab\public\assets\equipment\fig"
OUT = r"D:\PythonProject\physics-lab\audit\fidelity"
PAIRS = {"ammeterA": "ammeterA_c.png", "voltmeter": "voltmeter2_c.png"}
HUB = (128.0, 164.0)


def ink(path):
    im = Image.open(path).convert("RGB")
    a = np.array(im).astype(float)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    luma = 0.3 * r + 0.59 * g + 0.11 * b
    red = (r > 110) & (r - g > 45) & (r - b > 45)
    m = (luma < 200) & (~red)
    m[:26, :] = False          # 只留表盘区域：y>=26、x 22..234
    m[176:, :] = False
    m[:, :22] = False
    m[:, 234:] = False
    return m.astype(np.uint8)


def blobs(m, minarea=14, maxarea=220):
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m, 8)
    out = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < minarea or area > maxarea:
            continue
        if w > 34 or h > 34:
            continue
        cx, cy = cent[i]
        r = ((cx - HUB[0]) ** 2 + (cy - HUB[1]) ** 2) ** 0.5
        ang = np.degrees(np.arctan2(cy - HUB[1], cx - HUB[0])) % 360
        out.append((cx, cy, w, h, area, r, ang))
    return out


def main():
    key = sys.argv[1] if len(sys.argv) > 1 else "ammeterA"
    ref = ink(f"{FIG}\\{PAIRS[key]}")
    art = ink(f"{OUT}\\m256-{key}.png")
    A = blobs(ref)
    B = blobs(art)
    print(f"{key}: 原图墨块 {len(A)} / 渲染墨块 {len(B)}")
    rows = []
    for a in A:
        if B:
            best = min(B, key=lambda b: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
            d = ((a[0] - best[0]) ** 2 + (a[1] - best[1]) ** 2) ** 0.5
        else:
            best, d = None, 9e9
        rows.append((a, best, d))
    rows.sort(key=lambda t: -t[0][4])
    for a, b, d in rows[:34]:
        bs = f"({b[0]:.0f},{b[1]:.0f}) {b[2]}x{b[3]} a{b[4]}" if b else "-"
        print(f"原 ({a[0]:.0f},{a[1]:.0f}) {a[2]}x{a[3]} a{a[4]} r{a[5]:.0f} ang{a[6]:.0f}  ->  {bs}  d={d:.1f}")


main()
