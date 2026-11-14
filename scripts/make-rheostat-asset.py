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
# 通电线圈的「只看绕线」蒙版：白底 RGBA，alpha 越大越该被染成金黄
OUT_MASK = os.path.join(ROOT, "public", "assets", "equipment", "fig", "rheostat_coilmask.png")

BOX = (10, 79, 235, 170)   # 225×91：中间的"无滑片整机"
DISP = (190, 79)           # 显示尺寸（SVG 的 viewBox）
SIZE = (448, 186)          # 素材尺寸 ≈ 显示尺寸的 2.36 倍（既不是整 2 倍，换算必须按真比例）
SX = SIZE[0] / float(DISP[0])
SY = SIZE[1] / float(DISP[1])


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
    rgb_out = turnify(rgb_out, al)
    out = np.concatenate([np.clip(rgb_out, 0, 255), al * 255.0], axis=2).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(OUT, optimize=True)
    print("saved", OUT, out.shape[1], "x", out.shape[0])

    # ── 通电线圈蒙版 ──
    # 滑变通电时只有绕在瓷筒上的电阻丝该变金黄，瓷筒本体/金属环/金属杆不该跟着黄。
    # 绕线与瓷筒的分界靠两件事：绕线更暗（L 低）、更饱和（S 高），
    # 再乘一个只覆盖绕线带（显示 36.6..157.2 / 13.2..54.5）的软边窗口，外面一律不染。
    mask = coil_mask(out)
    Image.merge("RGBA", [Image.new("L", mask.size, 255)] * 3 + [mask]).save(OUT_MASK, optimize=True)
    print("saved", OUT_MASK)


def turnify(rgb, al, band=(36.6, 157.2, 13.2, 54.5)):
    """把糊成一片的绕线重画成"一圈一圈的漆包线"

    拆解图上的绕线只有 2~3 个像素宽，放大 2 倍后只剩一团灰雾（用户说"绕线不真实"）。
    做法：保留照片每一行的柱面明暗（对行方向做中值/模糊得到 base），
    横向改成周期 3.15 显示像素的正弦亮度调制 → 一圈圈凸起的漆包线；
    只在绕线带内、且原图不透明的地方生效，瓷筒/金属环一像素都不动。
    """
    H, W = rgb.shape[:2]
    ys, xs = np.mgrid[0:H, 0:W]
    x0, x1, y0, y1 = band[0] * SX, band[1] * SX, band[2] * SY, band[3] * SY
    bx = np.clip((xs - x0) / 4, 0, 1) * np.clip((x1 - xs) / 4, 0, 1)
    by = np.clip((ys - y0) / 4, 0, 1) * np.clip((y1 - ys) / 4, 0, 1)
    w = bx * by
    region = (w > 0.02) & (al[..., 0] > 0.5)
    if not region.any():
        return rgb

    # 每一行的柱面底色：绕线带内、非透明像素的横向中值
    base = np.empty_like(rgb)
    for y in range(H):
        m = region[y]
        if not m.any():
            base[y] = rgb[y]
            continue
        base[y] = np.median(rgb[y][m], axis=0)
    # 行方向轻微平滑，避免逐行中值把柱面高光切成台阶
    k = np.array([1, 2, 3, 2, 1], dtype=np.float32)
    k /= k.sum()
    for c in range(3):
        col = base[:, :, c].mean(axis=1)
        pad = np.pad(col, 2, mode="edge")
        sm = np.convolve(pad, k, mode="valid")
        base[:, :, c] = sm[:, None]

    # 一圈一圈：周期 3.15 显示像素（素材 6.3px）；相位固定 —— 真绕线是一圈圈竖直的，
    # 加了逐行抖动会变成"波浪纹"，反而更假
    P = 3.0 * SX   # 一圈 3.0 显示像素
    u = (xs - x0) / P
    s = 0.5 - 0.5 * np.cos(2 * np.pi * u)            # 0=凹槽 1=绕线凸起
    gain = 0.70 + 0.46 * s ** 0.85                   # 0.70 .. 1.16
    shaded = base * gain[..., None]
    # 凹槽里偏暗偏冷一点，像漆包线之间的缝
    shaded = shaded * (1.0 - 0.10 * (1 - s)[..., None])
    mix = (w * (al[..., 0] > 0.5).astype(np.float32))[..., None]
    return rgb * (1 - mix) + shaded * mix


def coil_mask(out, box=(36.6, 157.2, 13.2, 54.5)):
    """绕线蒙版（L 通道 → alpha）：band 内越暗越饱和 → 越白"""
    H, W = out.shape[:2]
    rgb = out[..., :3].astype(np.float32) / 255.0
    al = out[..., 3:4].astype(np.float32) / 255.0
    flat = rgb * al + 1.0 * (1 - al)          # 合成到白底，透明区的"白"不参与判定
    L = flat[..., 0] * 0.299 + flat[..., 1] * 0.587 + flat[..., 2] * 0.114
    mx = flat.max(axis=2)
    mn = flat.min(axis=2)
    S = (mx - mn) / np.maximum(mx, 1e-3)
    ys, xs = np.mgrid[0:H, 0:W]
    # 显示坐标 → 素材坐标（素材是显示尺寸的 2.36 倍，不能按 2 倍算）
    x0, x1, y0, y1 = box[0] * SX, box[1] * SX, box[2] * SY, box[3] * SY
    bx = np.clip((xs - x0) / 6, 0, 1) * np.clip((x1 - xs) / 6, 0, 1)
    by = np.clip((ys - y0) / 6, 0, 1) * np.clip((y1 - ys) / 6, 0, 1)
    band = bx * by
    dark = np.clip((0.86 - L) / 0.30, 0, 1)
    sat = np.clip((S - 0.06) / 0.10, 0, 1)
    m = np.clip((dark * 0.75 + sat * 0.35) * band, 0, 1)
    return Image.fromarray((m * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.0))


if __name__ == "__main__":
    main()
