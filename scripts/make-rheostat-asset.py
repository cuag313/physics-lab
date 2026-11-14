"""make-rheostat-asset.py —— 从拆解图生成「无滑片整机」底图 rheostat_c2.png

来源：public/assets/iconsnewname/11滑线变阻器 .png（256×256 RGBA 拆解图）
  · 上：两块瓷筒特写
  · 中：整机（没有滑片）← 用这块
  · 左下：单独滑片零件

做法：裁中间那块（10,79)-(235,170) = 225×91，缩放到底图画布 448×186
（= 显示尺寸 190×79 的 2 倍，浏览器缩到 190 时绕线更清晰），
按 alpha 预乘缩放避免透明区白边被混进边缘，再对 RGB 做 UnsharpMask 让
每一圈漆包线看得见（1 倍尺寸下就是"绕线真实"的关键）。
保留原始 alpha（含自带柔和投影），不要压成白底——白底会在网格桌面上露一个白方块。

用法：& "C:\\Users\\think\\miniconda3\\python.exe" scripts\\make-rheostat-asset.py
"""

from PIL import Image, ImageFilter
import numpy as np
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 拆解图原件：本仓库可能没带这份素材，退到用户另一份 checkout 里的同名文件
SRC_CANDIDATES = [
    os.path.join(ROOT, "public", "assets", "iconsnewname", "11滑线变阻器 .png"),
    r"E:\cuag313\physics-lab\public\assets\iconsnewname\11滑线变阻器 .png",
]
OUT = os.path.join(ROOT, "public", "assets", "equipment", "fig", "rheostat_c2.png")

BOX = (10, 79, 235, 170)   # 225×91：中间的"无滑片整机"
SIZE = (448, 186)          # 2 倍于 190×79 显示尺寸


def main():
    src_path = next((p for p in SRC_CANDIDATES if os.path.exists(p)), None)
    if src_path is None:
        raise SystemExit("找不到拆解图原件：\n  " + "\n  ".join(SRC_CANDIDATES))
    src = Image.open(src_path).convert("RGBA")
    crop = src.crop(BOX)
    arr = np.asarray(crop).astype(np.float32) / 255.0
    rgb, alpha = arr[..., :3], arr[..., 3:4]
    # 预乘：透明像素的 RGB 是白的，直接缩放会把白边混到边缘
    premul = Image.fromarray(np.clip(rgb * alpha * 255.0, 0, 255).astype(np.uint8), "RGB")
    premul = premul.resize(SIZE, Image.LANCZOS)
    alpha_big = crop.getchannel("A").resize(SIZE, Image.LANCZOS)

    # 只锐化 RGB（对 alpha 锐化会在边缘起光晕）
    premul = premul.filter(ImageFilter.UnsharpMask(radius=1.6, percent=140, threshold=2))

    a = np.asarray(premul).astype(np.float32)
    al = np.asarray(alpha_big).astype(np.float32) / 255.0
    al = al[..., None]
    rgb_out = np.where(al > 1e-4, a / np.maximum(al, 1e-4), 0.0)
    out = np.concatenate([np.clip(rgb_out, 0, 255), al * 255.0], axis=2).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(OUT, optimize=True)
    print("saved", OUT, out.shape[1], "x", out.shape[0])


if __name__ == "__main__":
    main()
