from PIL import Image
import pytesseract
import cv2
import numpy as np

path = r"C:\Windows\Temp\mimo-paste-1793270258414-691gqv.png"
img = Image.open(path)
print("size", img.size)

text = pytesseract.image_to_string(img, lang="chi_sim+eng", config="--psm 6")
print("===== OCR PSM6 =====")
print(text)

text11 = pytesseract.image_to_string(img, lang="chi_sim+eng", config="--psm 11")
print("===== OCR PSM11 =====")
print(text11)

arr = np.array(img.convert("RGB"))
gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
if gray.mean() < 128:
    gray = 255 - gray
gray = cv2.resize(gray, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
_, thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
text2 = pytesseract.image_to_string(thr, lang="chi_sim+eng", config="--psm 6")
print("===== OCR PRE =====")
print(text2)

# Save preprocessed for later visual inspection if needed
cv2.imwrite(r"D:\PythonProject\physics-lab\scripts\_ocr_pre.png", thr)
print("saved preprocessed image")
