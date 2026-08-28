"""器件渲染器
在 tkinter Canvas 上渲染NB器件图片，支持位置、旋转、缩放
"""
from PIL import Image, ImageTk, ImageFilter
from image_loader import get_loader


class DeviceSprite:
    """Canvas上的器件图片精灵"""

    def __init__(self, canvas, category, filename, x=0, y=0, scale=1.0, tag="device"):
        self.canvas = canvas
        self.category = category
        self.filename = filename
        self.x = x
        self.y = y
        self.scale = scale
        self.tag = tag
        self._tk_image = None
        self._canvas_id = None
        self._load()

    def _load(self):
        loader = get_loader()
        pil_img = loader.load_pil(self.category, self.filename)
        if pil_img is None:
            return

        # 缩放
        if self.scale != 1.0:
            w = int(pil_img.width * self.scale)
            h = int(pil_img.height * self.scale)
            pil_img = pil_img.resize((w, h), Image.LANCZOS)

        self._pil_image = pil_img
        self._tk_image = ImageTk.PhotoImage(pil_img)

    def draw(self):
        """在Canvas上绘制"""
        if self._tk_image is None:
            return
        self._canvas_id = self.canvas.create_image(
            self.x, self.y, image=self._tk_image, anchor="center", tags=self.tag
        )
        return self._canvas_id

    def move_to(self, x, y):
        """移动到新位置"""
        if self._canvas_id is not None:
            dx = x - self.x
            dy = y - self.y
            self.canvas.move(self._canvas_id, dx, dy)
        self.x, self.y = x, y

    def delete(self):
        """从Canvas删除"""
        if self._canvas_id is not None:
            self.canvas.delete(self._canvas_id)
            self._canvas_id = None

    @property
    def width(self):
        return self._pil_image.width if self._pil_image else 0

    @property
    def height(self):
        return self._pil_image.height if self._pil_image else 0


class DeviceRenderer:
    """管理Canvas上所有器件的渲染"""

    def __init__(self, canvas):
        self.canvas = canvas
        self.sprites = []  # [(id, DeviceSprite), ...]
        self.loader = get_loader()

    def add_device(self, category, filename, x=0, y=0, scale=1.0, tag="device"):
        """添加一个器件图片到Canvas"""
        sprite = DeviceSprite(self.canvas, category, filename, x, y, scale, tag)
        sprite.draw()
        self.sprites.append(sprite)
        return sprite

    def add_from_path(self, full_path, x=0, y=0, scale=1.0, tag="device"):
        """从完整路径添加器件"""
        pil_img = self.loader.load_from_path(full_path)
        if pil_img is None:
            return None

        if scale != 1.0:
            w = int(pil_img.width * scale)
            h = int(pil_img.height * scale)
            pil_img = pil_img.resize((w, h), Image.LANCZOS)

        tk_img = ImageTk.PhotoImage(pil_img)
        canvas_id = self.canvas.create_image(
            x, y, image=tk_img, anchor="center", tags=tag
        )

        sprite = DeviceSprite.__new__(DeviceSprite)
        sprite.canvas = self.canvas
        sprite.x = x
        sprite.y = y
        sprite.scale = scale
        sprite.tag = tag
        sprite._pil_image = pil_img
        sprite._tk_image = tk_img
        sprite._canvas_id = canvas_id
        sprite.category = ""
        sprite.filename = os.path.basename(full_path)
        self.sprites.append(sprite)
        return sprite

    def clear(self):
        """清除所有器件"""
        for s in self.sprites:
            s.delete()
        self.sprites.clear()

    def get_devices_by_tag(self, tag):
        """按tag查找器件"""
        return [s for s in self.sprites if s.tag == tag]


# 需要导入 os
import os
