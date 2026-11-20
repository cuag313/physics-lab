from PIL import Image, ImageDraw, ImageFont
import os

OUT = 'audit/fidelity'
CASES = [
    ('closed', '合闸(基准)'),
    ('s20', '转 20°'),
    ('s40', '转 40°'),
    ('s55', '转 55°'),
    ('s65', '转 65°'),
    ('s74', '转 74°（终态）'),
]
SHEET = 'pivot-sweep.png'
FONT = 'C:/Windows/Fonts/msyh.ttc'
f = ImageFont.truetype(FONT, 26)

tiles = [Image.open(os.path.join(OUT, f'pivot-{k}.png')) for k, _ in CASES]
w, h = tiles[0].size
lab = 56
gap = 14
sheet = Image.new('RGB', (len(tiles) * w + (len(tiles) - 1) * gap, h + lab), (245, 245, 245))
d = ImageDraw.Draw(sheet)
for i, (t, (k, text)) in enumerate(zip(tiles, CASES)):
    x = i * (w + gap)
    sheet.paste(t, (x, lab))
    d.text((x + 8, 12), text, font=f, fill=(20, 20, 20))
    d.rectangle([x, lab, x + w - 1, lab + h - 1], outline=(150, 150, 150))
sheet.save(os.path.join(OUT, SHEET))
print('ok', sheet.size)
