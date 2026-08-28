"""物理实验室 - 主应用"""
import tkinter as tk
from tkinter import font as tkfont
from experiments import ALL_EXPERIMENTS
from image_browser import ImageBrowser


class PhysicsLabApp:
    """物理实验室主窗口"""

    BG = "#0f0f1a"
    SIDEBAR_BG = "#16162a"
    ACCENT = "#4a90d9"
    TEXT = "#e0e0e0"

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("物理实验室 v0.1 — NB器件图片集成")
        self.root.geometry("1100x650")
        self.root.minsize(900, 550)
        self.root.configure(bg=self.BG)

        # 字体
        self.title_font = tkfont.Font(family="Arial", size=14, weight="bold")
        self.normal_font = tkfont.Font(family="Arial", size=10)
        self.small_font = tkfont.Font(family="Arial", size=9)

        self.current_view = None  # 当前显示的视图（实验或浏览器）
        self.buttons = {}

        self._build_ui()

    def _build_ui(self):
        # 左侧边栏
        self.sidebar = tk.Frame(self.root, bg=self.SIDEBAR_BG, width=200)
        self.sidebar.pack(side=tk.LEFT, fill=tk.Y)
        self.sidebar.pack_propagate(False)

        # 标题
        tk.Label(self.sidebar, text="物理实验室", font=self.title_font,
                 bg=self.SIDEBAR_BG, fg=self.ACCENT).pack(pady=(15, 5))
        tk.Label(self.sidebar, text="NB图片 + Python引擎", font=self.small_font,
                 bg=self.SIDEBAR_BG, fg="#666").pack()

        tk.Frame(self.sidebar, bg="#333", height=1).pack(fill=tk.X, padx=15, pady=10)

        # ── 器件图片库按钮 ──
        tk.Label(self.sidebar, text="资源", font=self.small_font,
                 bg=self.SIDEBAR_BG, fg="#888", anchor="w").pack(
                     padx=15, pady=(5, 3), fill=tk.X)

        btn = tk.Button(
            self.sidebar, text="  器件图片库", font=self.normal_font,
            bg=self.SIDEBAR_BG, fg="#00cc88", activebackground="#2a2a4a",
            activeforeground="white", relief=tk.FLAT, anchor="w",
            padx=15, pady=8, cursor="hand2",
            command=self._show_image_browser,
        )
        btn.pack(fill=tk.X, padx=5, pady=1)
        btn.bind("<Enter>", lambda e, b=btn: b.configure(bg="#1e1e3a"))
        btn.bind("<Leave>", lambda e, b=btn: b.configure(bg=self.SIDEBAR_BG))
        self.buttons["_browser"] = btn

        tk.Frame(self.sidebar, bg="#333", height=1).pack(fill=tk.X, padx=15, pady=8)

        # ── 实验列表 ──
        tk.Label(self.sidebar, text="实验列表", font=self.small_font,
                 bg=self.SIDEBAR_BG, fg="#888", anchor="w").pack(
                     padx=15, pady=(5, 5), fill=tk.X)

        for exp_id, exp_cls in ALL_EXPERIMENTS.items():
            btn = tk.Button(
                self.sidebar, text=exp_cls.name, font=self.normal_font,
                bg=self.SIDEBAR_BG, fg=self.TEXT, activebackground="#2a2a4a",
                activeforeground="white", relief=tk.FLAT, anchor="w",
                padx=15, pady=8, cursor="hand2",
                command=lambda eid=exp_id: self._select_experiment(eid),
            )
            btn.pack(fill=tk.X, padx=5, pady=1)
            btn.bind("<Enter>", lambda e, b=btn: b.configure(bg="#1e1e3a"))
            btn.bind("<Leave>", lambda e, b=btn: b.configure(bg=self.SIDEBAR_BG))
            self.buttons[exp_id] = btn

        # 底部信息
        tk.Frame(self.sidebar, bg="#333", height=1).pack(
            fill=tk.X, padx=15, pady=10, side=tk.BOTTOM)
        tk.Label(self.sidebar, text="纯Python | 离线运行\nNB图片 + 物理引擎",
                 font=self.small_font, bg=self.SIDEBAR_BG, fg="#555",
                 justify=tk.CENTER).pack(side=tk.BOTTOM, pady=5)

        # 右侧内容区
        self.content = tk.Frame(self.root, bg=self.BG)
        self.content.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # 欢迎界面
        self._show_welcome()

    def _show_welcome(self):
        """显示欢迎界面"""
        self._clear_content()
        self._highlight_button(None)

        welcome = tk.Frame(self.content, bg=self.BG)
        welcome.place(relx=0.5, rely=0.5, anchor="center")

        tk.Label(welcome, text="物理实验室", font=("Arial", 28, "bold"),
                 bg=self.BG, fg=self.ACCENT).pack(pady=(0, 10))
        tk.Label(welcome, text="NB器件图片 + Python物理引擎", font=("Arial", 14),
                 bg=self.BG, fg="#666").pack(pady=(0, 25))
        tk.Label(welcome, text="从左侧选择功能",
                 font=("Arial", 12), bg=self.BG, fg="#888").pack()

        # 功能预览
        preview = tk.Frame(welcome, bg=self.BG)
        preview.pack(pady=20)

        item = tk.Frame(preview, bg="#1a1a2e", padx=12, pady=8)
        item.pack(fill=tk.X, pady=3)
        tk.Label(item, text="  器件图片库", font=self.normal_font,
                 bg="#1a1a2e", fg="#00cc88", anchor="w").pack(side=tk.LEFT)
        tk.Label(item, text="浏览NB物理实验器件图片",
                 font=self.small_font, bg="#1a1a2e", fg="#666",
                 anchor="w").pack(side=tk.RIGHT)

        for exp_id, exp_cls in ALL_EXPERIMENTS.items():
            item = tk.Frame(preview, bg="#1a1a2e", padx=12, pady=6)
            item.pack(fill=tk.X, pady=3)
            tk.Label(item, text=f"▸ {exp_cls.name}", font=self.normal_font,
                     bg="#1a1a2e", fg=self.TEXT, anchor="w").pack(side=tk.LEFT)
            tk.Label(item, text=exp_cls.description[:20] + "...",
                     font=self.small_font, bg="#1a1a2e", fg="#666",
                     anchor="w").pack(side=tk.RIGHT)

        self.current_view = welcome

    def _show_image_browser(self):
        """显示图片浏览器"""
        self._clear_content()
        self._highlight_button("_browser")

        browser = ImageBrowser(self.content, on_select=self._on_image_select)
        browser.pack(fill=tk.BOTH, expand=True)
        self.current_view = browser

    def _on_image_select(self, category, filename, pil_image):
        """图片被选中时的回调"""
        print(f"选中器件: {category}/{filename}  尺寸: {pil_image.size}")

    def _select_experiment(self, exp_id):
        """切换实验"""
        self._clear_content()
        self._highlight_button(exp_id)

        exp_cls = ALL_EXPERIMENTS[exp_id]
        self.current_view = exp_cls(self.content)
        self.current_view.frame.pack(fill=tk.BOTH, expand=True)

    def _clear_content(self):
        """清空内容区"""
        if self.current_view and hasattr(self.current_view, 'destroy'):
            self.current_view.destroy()
        for w in self.content.winfo_children():
            w.destroy()
        self.current_view = None

    def _highlight_button(self, active_id):
        """高亮当前选中的按钮"""
        for eid, btn in self.buttons.items():
            if eid == active_id:
                btn.configure(bg="#2a2a4a")
            else:
                btn.configure(bg=self.SIDEBAR_BG)

    def run(self):
        self.root.mainloop()
