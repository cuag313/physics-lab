from PIL import Image
import pytesseract
import cv2
import numpy as np

src = r"C:\Windows\Temp\mimo-paste-1793270258414-691gqv.png"
img = Image.open(src).convert("RGB")
W, H = img.size
print("full", W, H)

# The NB lab canvas is likely the central area. Crop several regions.
regions = {
    "top_toolbar": (0, 80, W, 180),
    "title_row": (0, 130, W, 220),
    "left_palette": (0, 200, 380, H),
    "canvas_main": (300, 220, 1050, 720),
    "canvas_right": (850, 200, W, 720),
    "bottom_bar": (0, 700, W, H),
    "readings_area": (400, 250, 900, 450),
    "center_circuit": (350, 300, 1000, 650),
}

for name, (l, t, r, b) in regions.items():
    crop = img.crop((l, t, r, b))
    out = rf"D:\PythonProject\physics-lab\scripts\_crop_{name}.png"
    crop.save(out)
    gray = cv2.cvtColor(np.array(crop), cv2.COLOR_RGB2GRAY)
    if gray.mean() < 140:
        gray = 255 - gray
    scale = 2.0
    gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    _, thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for psm in (6, 11, 4):
        text = pytesseract.image_to_string(thr, lang="chi_sim+eng", config=f"--psm {psm}")
        text = "\n".join([ln for ln in text.splitlines() if ln.strip()])
        if text.strip():
            print(f"\n===== {name} psm{psm} =====")
            print(text)

# Also try to find connected components / color blobs to map component positions
arr = np.array(img)
# Detect orange (rheostat?), green (terminal?), red (positive), black wires
hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)

def find_color(name, lower, upper):
    mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
    n = int((mask > 0).sum())
    if n > 200:
        ys, xs = np.where(mask > 0)
        print(f"color {name}: pixels={n}, bbox=({xs.min()},{ys.min()})-({xs.max()},{ys.max()}), centroid=({int(xs.mean())},{int(ys.mean())})")
    else:
        print(f"color {name}: few pixels={n}")

find_color("orange", (5, 100, 100), (25, 255, 255))
find_color("red", (0, 100, 100), (10, 255, 255))
find_color("green", (40, 80, 80), (85, 255, 255))
find_color("blue", (100, 80, 80), (130, 255, 255))
find_color("yellow", (20, 100, 100), (35, 255, 255))
find_color("purple", (130, 50, 50), (160, 255, 255))
