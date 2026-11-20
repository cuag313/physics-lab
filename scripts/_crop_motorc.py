from PIL import Image
im = Image.open(r'D:\PythonProject\physics-lab\public\assets\equipment\fig\motor_c.png').convert('RGBA')
w, h = im.size
crop = im.crop((0, int(h * 0.72), w, h)).resize((w * 2, (h - int(h * 0.72)) * 2), Image.NEAREST)
crop.save(r'D:\PythonProject\physics-lab\audit\fidelity\_motorc_bottom.png')
print('saved', crop.size)
