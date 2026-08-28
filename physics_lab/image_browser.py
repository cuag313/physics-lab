"""NB器件图片浏览器
可独立运行，也可嵌入主应用
"""
import tkinter as tk
from tkinter import ttk
from image_loader import get_loader, CATEGORIES, CATEGORY_NAMES


class ImageBrowser:
    """图片浏览器组件"""

    BG = "#0f0f1a"
    CARD_BG = "#1a1a2e"
    ACCENT = "#4a90d9"
    THUMB_SIZE = (120, 100)

    def __init__(self, parent, on_select=None):
        self.parent = parent
        self.on_select = on_select  # 回调: (category, filename, pil_image)
        self.loader = get_loader()
        self.current_category = CATEGORIES[0]
        self.build_ui()
        self._show_category(self.current_category)

    def build_ui(self):
        self.frame = tk.Frame(self.parent, bg=self.BG)

        # 顶部分类选择
        top = tk.Frame(self.frame, bg="#16162a")
        top.pack(fill=tk.X, padx=5, pady=5)

        tk.Label(top, text="器件图片库", font=("Arial", 12, "bold"),
                 bg="#16162a", fg="#e0e0e0").pack(side=tk.LEFT, padx=8)

        self.cat_var = tk.StringVar(value=CATEGORY_NAMES[self.current_category])
        for cat_key, cat_name, count in self.loader.list_categories():
            btn = tk.Radiobutton(
                top, text=f"{cat_name}({count})",
                variable=self.cat_var, value=cat_name,
                command=lambda c=cat_key: self._show_category(c),
                bg="#16162a", fg="#ccc", selectcolor="#0f3460",
                activebackground="#0f3460", activeforeground="#fff",
                font=("Arial", 10), indicatoron=False, padx=10, pady=4,
            )
            btn.pack(side=tk.LEFT, padx=2)

        # 搜索框
        tk.Label(top, text="  搜索:", bg="#16162a", fg="#888").pack(side=tk.LEFT, padx=(15, 2))
        self.search_var = tk.StringVar()
        self.search_var.trace("w", self._on_search)
        search_entry = tk.Entry(top, textvariable=self.search_var, width=15,
                                bg="#0f3460", fg="#fff", insertbackground="#fff",
                                font=("Arial", 10))
        search_entry.pack(side=tk.LEFT, padx=4)

        # 画布 + 滚动条
        container = tk.Frame(self.frame, bg=self.BG)
        container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        self.canvas = tk.Canvas(container, bg=self.BG, highlightthickness=0)
        scrollbar = ttk.Scrollbar(container, orient=tk.VERTICAL, command=self.canvas.yview)
        self.scroll_frame = tk.Frame(self.canvas, bg=self.BG)

        self.scroll_frame.bind("<Configure>",
                              lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.canvas.create_window((0, 0), window=self.scroll_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

        # 鼠标滚轮
        self.canvas.bind("<Enter>", lambda e: self.canvas.bind_all("<MouseWheel>", self._on_scroll))
        self.canvas.bind("<Leave>", lambda e: self.canvas.unbind_all("<MouseWheel>"))

        # 底部状态栏
        self.status_var = tk.StringVar(value="就绪")
        tk.Label(self.frame, textvariable=self.status_var, bg="#16162a", fg="#666",
                 font=("Arial", 9), anchor="w").pack(fill=tk.X, padx=5, pady=(0, 5))

    def _show_category(self, category):
        self.current_category = category
        self.search_var.set("")
        self._render_grid(self.loader.list_images(category))

    def _on_search(self, *args):
        query = self.search_var.get().lower()
        all_files = self.loader.list_images(self.current_category)
        if not query:
            self._render_grid(all_files)
        else:
            filtered = [f for f in all_files if query in f.lower()]
            self._render_grid(filtered)

    def _render_grid(self, filenames):
        # 清空
        for w in self.scroll_frame.winfo_children():
            w.destroy()

        if not filenames:
            tk.Label(self.scroll_frame, text="无匹配图片", bg=self.BG, fg="#666",
                     font=("Arial", 12)).pack(pady=40)
            self.status_var.set("0 张图片")
            return

        # 网格布局
        cols = max(1, self.canvas.winfo_width() // 140)
        if cols < 1:
            cols = 6

        for i, fn in enumerate(filenames):
            row, col = divmod(i, cols)
            card = tk.Frame(self.scroll_frame, bg=self.CARD_BG, cursor="hand2")
            card.grid(row=row, column=col, padx=4, pady=4, sticky="nsew")

            # 加载缩略图
            pil_img = self.loader.load_pil(self.current_category, fn, self.THUMB_SIZE)
            if pil_img:
                tk_img = self.loader.load_tk(self.current_category, fn, self.THUMB_SIZE)
                if tk_img:
                    lbl = tk.Label(card, image=tk_img, bg=self.CARD_BG)
                    lbl.image = tk_img  # 保持引用
                    lbl.pack(padx=5, pady=(5, 0))

            # 文件名（截短显示）
            short_name = fn[:16] + "..." if len(fn) > 16 else fn
            tk.Label(card, text=short_name, bg=self.CARD_BG, fg="#888",
                     font=("Arial", 7), wraplength=120).pack(padx=3, pady=(0, 3))

            # 点击事件
            card.bind("<Button-1>", lambda e, c=self.current_category, f=fn: self._on_click(c, f))
            for child in card.winfo_children():
                child.bind("<Button-1>", lambda e, c=self.current_category, f=fn: self._on_click(c, f))

        self.status_var.set(f"{len(filenames)} 张图片 | 分类: {CATEGORY_NAMES.get(self.current_category, '')}")

    def _on_click(self, category, filename):
        if self.on_select:
            pil_img = self.loader.load_pil(category, filename)
            self.on_select(category, filename, pil_img)

    def _on_scroll(self, event):
        self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def pack(self, **kwargs):
        self.frame.pack(**kwargs)

    def grid(self, **kwargs):
        self.frame.grid(**kwargs)


# ── 独立运行 ──────────────────────────────────────
def main():
    root = tk.Tk()
    root.title("NB器件图片浏览器")
    root.geometry("900x600")
    root.configure(bg="#0f0f1a")

    def on_select(cat, fn, img):
        print(f"选中: {cat}/{fn}  尺寸: {img.size}  模式: {img.mode}")

    browser = ImageBrowser(root, on_select=on_select)
    browser.pack(fill=tk.BOTH, expand=True)

    root.mainloop()


if __name__ == "__main__":
    main()
