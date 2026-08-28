"""NB器件图片加载器
从 public/categorized/ 目录加载图片，支持缓存和分类查询
"""
import os
import hashlib
from PIL import Image, ImageTk

# NB图片根目录（相对于项目根）
_NB_BASE = os.path.join(os.path.dirname(__file__), "..", "public", "categorized")

# 分类目录名
CATEGORIES = ["mechanics", "electromagnetism", "optics", "thermal"]

# 分类中文名
CATEGORY_NAMES = {
    "mechanics": "力学",
    "electromagnetism": "电磁学",
    "optics": "光学",
    "thermal": "热学",
}


class ImageLoader:
    """加载并缓存NB器件图片"""

    def __init__(self, base_dir=None):
        self.base_dir = base_dir or _NB_BASE
        self._cache = {}        # path -> PIL Image
        self._tk_cache = {}     # path -> PhotoImage (按size分)
        self._index = {}        # category -> [filename, ...]
        self._build_index()

    def _build_index(self):
        """扫描所有分类目录，建立索引"""
        for cat in CATEGORIES:
            cat_dir = os.path.join(self.base_dir, cat)
            if not os.path.isdir(cat_dir):
                continue
            files = []
            for f in os.listdir(cat_dir):
                if f.lower().endswith((".png", ".jpg", ".jpeg")):
                    files.append(f)
            files.sort()
            self._index[cat] = files

    def list_categories(self):
        """返回所有分类 [(key, 中文名, 图片数)]"""
        result = []
        for cat in CATEGORIES:
            count = len(self._index.get(cat, []))
            result.append((cat, CATEGORY_NAMES.get(cat, cat), count))
        return result

    def list_images(self, category):
        """返回某分类下所有图片文件名"""
        return self._index.get(category, [])

    def get_image_path(self, category, filename):
        """获取图片完整路径"""
        return os.path.join(self.base_dir, category, filename)

    def load_pil(self, category, filename, max_size=None):
        """加载PIL Image，带缓存"""
        path = self.get_image_path(category, filename)
        cache_key = path + (f"_{max_size}" if max_size else "")

        if cache_key in self._cache:
            return self._cache[cache_key]

        if not os.path.exists(path):
            return None

        img = Image.open(path)
        # 统一转为RGBA（支持透明度）
        if img.mode not in ("RGBA", "LA"):
            img = img.convert("RGBA")
        elif img.mode == "LA":
            img = img.convert("RGBA")

        if max_size:
            img.thumbnail(max_size, Image.LANCZOS)

        self._cache[cache_key] = img
        return img

    def load_tk(self, category, filename, max_size=None):
        """加载 tkinter PhotoImage，带缓存"""
        path = self.get_image_path(category, filename)
        cache_key = "tk_" + path + (f"_{max_size}" if max_size else "")

        if cache_key in self._tk_cache:
            return self._tk_cache[cache_key]

        pil_img = self.load_pil(category, filename, max_size)
        if pil_img is None:
            return None

        tk_img = ImageTk.PhotoImage(pil_img)
        self._tk_cache[cache_key] = tk_img
        return tk_img

    def load_from_path(self, full_path, max_size=None):
        """直接从完整路径加载"""
        cache_key = full_path + (f"_{max_size}" if max_size else "")
        if cache_key in self._cache:
            return self._cache[cache_key]

        if not os.path.exists(full_path):
            return None

        img = Image.open(full_path)
        if img.mode not in ("RGBA", "LA"):
            img = img.convert("RGBA")
        elif img.mode == "LA":
            img = img.convert("RGBA")

        if max_size:
            img.thumbnail(max_size, Image.LANCZOS)

        self._cache[cache_key] = img
        return img

    def load_tk_from_path(self, full_path, max_size=None):
        """直接从完整路径加载tk PhotoImage"""
        cache_key = "tk_" + full_path + (f"_{max_size}" if max_size else "")
        if cache_key in self._tk_cache:
            return self._tk_cache[cache_key]

        pil_img = self.load_from_path(full_path, max_size)
        if pil_img is None:
            return None

        tk_img = ImageTk.PhotoImage(pil_img)
        self._tk_cache[cache_key] = tk_img
        return tk_img


# 全局单例
_loader = None


def get_loader():
    global _loader
    if _loader is None:
        _loader = ImageLoader()
    return _loader
