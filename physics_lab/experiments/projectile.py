"""抛体运动实验
公式: x = v0*cos(theta)*t, y = v0*sin(theta)*t - 0.5*g*t^2
"""
import math
import tkinter as tk
from tkinter import ttk
from .base import BaseExperiment

G = 9.81
SCALE = 10          # 1m = 10px
CANVAS_W = 800
CANVAS_H = 500
ORIGIN_X = 80       # 坐标原点 x
ORIGIN_Y = CANVAS_H - 60  # 坐标原点 y
DT = 0.02           # 时间步长 s
TRAIL_MAX = 200


class ProjectileExperiment(BaseExperiment):
    name = "抛体运动"
    description = "研究抛体运动的轨迹与初速度、发射角的关系"
    objectives = [
        "理解抛体运动轨迹",
        "验证运动方程",
        "分析初速度和角度的影响",
    ]

    def __init__(self, parent):
        super().__init__(parent)
        self.angle = 45.0       # 度
        self.v0 = 15.0          # m/s
        self.launched = False
        self.t = 0.0
        self.trail = []         # [(x_m, y_m), ...]
        self.pos_x = 0.0
        self.pos_y = 0.0
        self.build_ui()

    # ── UI ──────────────────────────────────────────────
    def build_ui(self):
        # 上方控制栏
        ctrl = tk.Frame(self.frame)
        ctrl.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)

        # 角度
        tk.Label(ctrl, text="角度(°):").pack(side=tk.LEFT)
        self.angle_var = tk.DoubleVar(value=self.angle)
        self.angle_scale = tk.Scale(
            ctrl, from_=5, to=85, orient=tk.HORIZONTAL,
            variable=self.angle_var, length=160, resolution=1,
            command=self._on_param_change,
        )
        self.angle_scale.pack(side=tk.LEFT, padx=4)
        self.angle_label = tk.Label(ctrl, text="45°", width=5)
        self.angle_label.pack(side=tk.LEFT)

        # 初速度
        tk.Label(ctrl, text="  初速度(m/s):").pack(side=tk.LEFT)
        self.v0_var = tk.DoubleVar(value=self.v0)
        self.v0_scale = tk.Scale(
            ctrl, from_=1, to=30, orient=tk.HORIZONTAL,
            variable=self.v0_var, length=160, resolution=0.5,
            command=self._on_param_change,
        )
        self.v0_scale.pack(side=tk.LEFT, padx=4)
        self.v0_label = tk.Label(ctrl, text="15.0", width=5)
        self.v0_label.pack(side=tk.LEFT)

        # 按钮
        self.launch_btn = tk.Button(ctrl, text="发射", command=self._launch,
                                     bg="#e74c3c", fg="white", font=("Arial", 11, "bold"),
                                     width=8)
        self.launch_btn.pack(side=tk.LEFT, padx=12)

        tk.Button(ctrl, text="重置", command=self.reset,
                  width=6).pack(side=tk.LEFT, padx=4)

        # 画布
        self.canvas = tk.Canvas(self.frame, width=CANVAS_W, height=CANVAS_H,
                                bg="#1a1a2e", highlightthickness=0)
        self.canvas.pack(padx=5, pady=5)

        # 右侧数据面板
        self._draw_grid()

    def _draw_grid(self):
        """绘制坐标网格"""
        c = self.canvas
        c.delete("grid")
        # 坐标轴
        c.create_line(ORIGIN_X, ORIGIN_Y, CANVAS_W - 20, ORIGIN_Y,
                      fill="#555", width=1, tags="grid")
        c.create_line(ORIGIN_X, ORIGIN_Y, ORIGIN_X, 20,
                      fill="#555", width=1, tags="grid")
        # X轴刻度
        for m in range(0, 60, 5):
            px = ORIGIN_X + m * SCALE
            if px > CANVAS_W - 20:
                break
            c.create_line(px, ORIGIN_Y, px, ORIGIN_Y + 5, fill="#666", tags="grid")
            c.create_text(px, ORIGIN_Y + 15, text=str(m), fill="#888",
                          font=("Arial", 8), tags="grid")
        # Y轴刻度
        for m in range(0, 40, 5):
            py = ORIGIN_Y - m * SCALE
            if py < 10:
                break
            c.create_line(ORIGIN_X - 5, py, ORIGIN_X, py, fill="#666", tags="grid")
            c.create_text(ORIGIN_X - 15, py, text=str(m), fill="#888",
                          font=("Arial", 8), tags="grid")
        # 轴标签
        c.create_text(CANVAS_W - 30, ORIGIN_Y + 15, text="x(m)", fill="#aaa",
                      font=("Arial", 9), tags="grid")
        c.create_text(ORIGIN_X - 5, 10, text="y(m)", fill="#aaa",
                      font=("Arial", 9), tags="grid")

    def _on_param_change(self, _=None):
        self.angle = self.angle_var.get()
        self.v0 = self.v0_var.get()
        self.angle_label.config(text=f"{self.angle:.0f}°")
        self.v0_label.config(text=f"{self.v0:.1f}")

    # ── 物理 ───────────────────────────────────────────
    def _launch(self):
        if self.launched:
            return
        self.launched = True
        self.t = 0.0
        self.trail = []
        self.pos_x = 0.0
        self.pos_y = 0.0
        self.running = True
        self.canvas.delete("trail")
        self.canvas.delete("projectile")
        self.canvas.delete("info")
        self._tick()

    def _tick(self):
        if not self.running:
            return
        self.t += DT
        rad = math.radians(self.angle)
        vx = self.v0 * math.cos(rad)
        vy = self.v0 * math.sin(rad)
        x = vx * self.t
        y = vy * self.t - 0.5 * G * self.t ** 2

        if y < 0:
            # 落地
            y = 0
            self.launched = False
            self.running = False
            self._draw_frame(x, y)
            self._show_landing(x)
            return

        self.pos_x, self.pos_y = x, y
        self.trail.append((x, y))
        if len(self.trail) > TRAIL_MAX:
            self.trail.pop(0)
        self._draw_frame(x, y)
        self._after_id = self.frame.after(int(DT * 1000), self._tick)

    def _draw_frame(self, x, y):
        c = self.canvas
        c.delete("projectile")
        c.delete("trail")

        # 轨迹线
        if len(self.trail) > 1:
            coords = []
            for tx, ty in self.trail:
                coords.append(ORIGIN_X + tx * SCALE)
                coords.append(ORIGIN_Y - ty * SCALE)
            c.create_line(*coords, fill="#ff6b6b", width=2, smooth=True, tags="trail")

        # 抛体
        px = ORIGIN_X + x * SCALE
        py = ORIGIN_Y - y * SCALE
        r = 6
        c.create_oval(px - r, py - r, px + r, py + r,
                      fill="#ff4444", outline="#ff8888", tags="projectile")

        # 实时数据
        vx = self.v0 * math.cos(math.radians(self.angle))
        vy = self.v0 * math.sin(math.radians(self.angle)) - G * self.t
        data = (f"t = {self.t:.2f}s   "
                f"x = {x:.2f}m   y = {y:.2f}m   "
                f"vx = {vx:.2f}  vy = {vy:.2f}")
        c.create_text(CANVAS_W // 2, 15, text=data, fill="#aaa",
                      font=("Consolas", 10), tags="projectile")

    def _show_landing(self, x):
        rad = math.radians(self.angle)
        theory_range = self.v0 ** 2 * math.sin(2 * rad) / G
        theory_h = (self.v0 * math.sin(rad)) ** 2 / (2 * G)
        c = self.canvas
        c.create_text(CANVAS_W // 2, CANVAS_H - 25,
                      text=f"落地! 实际射程={x:.2f}m  理论射程={theory_range:.2f}m  "
                           f"理论最大高度={theory_h:.2f}m",
                      fill="#00ff88", font=("Arial", 11, "bold"), tags="info")

    def reset(self):
        super().reset()
        self.launched = False
        self.t = 0.0
        self.trail = []
        self.pos_x = 0.0
        self.pos_y = 0.0
        self.canvas.delete("trail")
        self.canvas.delete("projectile")
        self.canvas.delete("info")
