"""单摆实验
公式: T = 2π√(L/g)
运动方程: d²θ/dt² = -(g/L)*sin(θ)
"""
import math
import tkinter as tk
from .base import BaseExperiment

G = 9.81
DT = 0.016          # 约 60fps
DAMPING = 0.999     # 轻微阻尼，更真实
CANVAS_W = 800
CANVAS_H = 500
PIVOT_X = CANVAS_W // 2
PIVOT_Y = 80
SCALE = 100          # 1m = 100px


class PendulumExperiment(BaseExperiment):
    name = "单摆实验"
    description = "探究单摆周期与摆长的关系，验证 T=2π√(L/g)"
    objectives = [
        "验证周期公式 T=2π√(L/g)",
        "探究摆长与周期的关系",
        "测量重力加速度",
    ]

    def __init__(self, parent):
        super().__init__(parent)
        self.length = 1.5         # m
        self.theta0 = math.pi / 6 # 初始角度 (30°)
        self.theta = self.theta0
        self.omega = 0.0          # 角速度
        self.t = 0.0
        self.running = False

        # 记录角度用于波形图
        self.theta_history = []
        self.time_history = []
        self.HISTORY_MAX = 600

        # 计时
        self.last_cross = None
        self.measured_period = None
        self.cross_count = 0

        self.build_ui()

    def build_ui(self):
        # 控制栏
        ctrl = tk.Frame(self.frame)
        ctrl.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)

        # 摆长
        tk.Label(ctrl, text="摆长(m):").pack(side=tk.LEFT)
        self.len_var = tk.DoubleVar(value=self.length)
        self.len_scale = tk.Scale(
            ctrl, from_=0.3, to=3.0, orient=tk.HORIZONTAL,
            variable=self.len_var, length=160, resolution=0.1,
            command=self._on_param_change,
        )
        self.len_scale.pack(side=tk.LEFT, padx=4)
        self.len_label = tk.Label(ctrl, text="1.5", width=5)
        self.len_label.pack(side=tk.LEFT)

        # 初始角度
        tk.Label(ctrl, text="  初始角度(°):").pack(side=tk.LEFT)
        self.ang_var = tk.DoubleVar(value=30)
        self.ang_scale = tk.Scale(
            ctrl, from_=5, to=80, orient=tk.HORIZONTAL,
            variable=self.ang_var, length=160, resolution=1,
            command=self._on_param_change,
        )
        self.ang_scale.pack(side=tk.LEFT, padx=4)
        self.ang_label = tk.Label(ctrl, text="30", width=5)
        self.ang_label.pack(side=tk.LEFT)

        # 按钮
        self.start_btn = tk.Button(ctrl, text="释放", command=self._start,
                                    bg="#27ae60", fg="white", font=("Arial", 11, "bold"),
                                    width=8)
        self.start_btn.pack(side=tk.LEFT, padx=12)
        tk.Button(ctrl, text="重置", command=self.reset,
                  width=6).pack(side=tk.LEFT, padx=4)

        # 数据标签
        self.data_var = tk.StringVar(value="准备就绪")
        tk.Label(ctrl, textvariable=self.data_var, font=("Consolas", 10)).pack(
            side=tk.RIGHT, padx=10)

        # 上半区：摆动画
        self.canvas = tk.Canvas(self.frame, width=CANVAS_W, height=CANVAS_H // 2 + 30,
                                bg="#1a1a2e", highlightthickness=0)
        self.canvas.pack(padx=5, pady=(5, 0))

        # 下半区：角度-时间波形
        self.wave_canvas = tk.Canvas(self.frame, width=CANVAS_W, height=CANVAS_H // 2 - 30,
                                     bg="#111122", highlightthickness=0)
        self.wave_canvas.pack(padx=5, pady=(0, 5))

        self._draw_initial()

    def _draw_initial(self):
        """绘制初始静态摆"""
        self.canvas.delete("all")
        # 支架
        self.canvas.create_line(PIVOT_X - 40, 10, PIVOT_X + 40, 10,
                                fill="#666", width=3)
        # 标尺刻度
        for i in range(6):
            y = 10 + i * 50
            self.canvas.create_text(PIVOT_X + 50, y, text=f"{i*0.5:.1f}m",
                                    fill="#444", font=("Arial", 7), anchor="w")
        self._draw_pendulum(self.theta0)

    def _draw_pendulum(self, theta):
        c = self.canvas
        c.delete("pendulum")

        bx = PIVOT_X + self.length * SCALE * math.sin(theta)
        by = PIVOT_Y + self.length * SCALE * math.cos(theta)

        # 绳子
        c.create_line(PIVOT_X, PIVOT_Y, bx, by,
                      fill="#ccc", width=2, tags="pendulum")
        # 摆球
        r = 12
        c.create_oval(bx - r, by - r, bx + r, by + r,
                      fill="#3498db", outline="#5dade2", width=2, tags="pendulum")
        # 支点
        c.create_oval(PIVOT_X - 4, PIVOT_Y - 4, PIVOT_X + 4, PIVOT_Y + 4,
                      fill="#888", tags="pendulum")

    def _on_param_change(self, _=None):
        self.length = self.len_var.get()
        self.theta0 = math.radians(self.ang_var.get())
        self.len_label.config(text=f"{self.length:.1f}")
        self.ang_label.config(text=f"{self.ang_var.get():.0f}")
        if not self.running:
            self.theta = self.theta0
            self.omega = 0.0
            self._draw_initial()

    # ── 物理 ───────────────────────────────────────────
    def _start(self):
        if self.running:
            return
        self.running = True
        self.theta = self.theta0
        self.omega = 0.0
        self.t = 0.0
        self.theta_history.clear()
        self.time_history.clear()
        self.last_cross = None
        self.measured_period = None
        self.cross_count = 0
        self._tick()

    def _tick(self):
        if not self.running:
            return

        # RK4 积分 d²θ/dt² = -(g/L)*sin(θ)
        self._rk4_step()
        self.t += DT

        # 记录历史
        self.theta_history.append(self.theta)
        self.time_history.append(self.t)
        if len(self.theta_history) > self.HISTORY_MAX:
            self.theta_history.pop(0)
            self.time_history.pop(0)

        # 过零检测（从正到负）用于测量周期
        if len(self.theta_history) >= 2:
            prev = self.theta_history[-2]
            curr = self.theta_history[-1]
            if prev > 0 and curr <= 0:
                if self.last_cross is not None:
                    self.measured_period = self.t - self.last_cross
                self.last_cross = self.t
                self.cross_count += 1

        self._draw_pendulum(self.theta)
        self._draw_wave()
        self._update_data()

        self._after_id = self.frame.after(int(DT * 1000), self._tick)

    def _rk4_step(self):
        """RK4 数值积分"""
        L = self.length
        g = G
        th = self.theta
        om = self.omega

        def accel(theta):
            return -(g / L) * math.sin(theta)

        k1_v = accel(th)
        k1_x = om

        k2_v = accel(th + 0.5 * DT * k1_x)
        k2_x = om + 0.5 * DT * k1_v

        k3_v = accel(th + 0.5 * DT * k2_x)
        k3_x = om + 0.5 * DT * k2_v

        k4_v = accel(th + DT * k3_x)
        k4_x = om + DT * k3_v

        self.omega = om + (DT / 6) * (k1_v + 2 * k2_v + 2 * k3_v + k4_v)
        self.omega *= DAMPING
        self.theta = th + (DT / 6) * (k1_x + 2 * k2_x + 2 * k3_x + k4_x)

    def _draw_wave(self):
        """绘制角度-时间波形图"""
        c = self.wave_canvas
        c.delete("wave")
        w = CANVAS_W
        h = int(c["height"])

        # 坐标轴
        mid_y = h // 2
        c.create_line(30, mid_y, w - 10, mid_y, fill="#333", tags="wave")
        c.create_line(30, 10, 30, h - 10, fill="#333", tags="wave")

        # 刻度
        max_ang = self.theta0 if self.theta0 > 0.1 else math.pi / 6
        c.create_text(15, 15, text=f"+{math.degrees(max_ang):.0f}°",
                      fill="#555", font=("Arial", 7), tags="wave")
        c.create_text(15, mid_y, text="0°", fill="#555", font=("Arial", 7), tags="wave")
        c.create_text(15, h - 15, text=f"-{math.degrees(max_ang):.0f}°",
                      fill="#555", font=("Arial", 7), tags="wave")

        if len(self.theta_history) < 2:
            return

        # 绘制波形
        n = len(self.theta_history)
        x_start = 40
        x_scale = (w - 50) / self.HISTORY_MAX
        y_scale = (mid_y - 20) / max_ang

        points = []
        for i, (t, th) in enumerate(zip(self.time_history, self.theta_history)):
            px = x_start + i * x_scale
            py = mid_y - th * y_scale
            points.append(px)
            points.append(py)

        if len(points) >= 4:
            c.create_line(*points, fill="#00ff88", width=1.5, smooth=True, tags="wave")

    def _update_data(self):
        theory_T = 2 * math.pi * math.sqrt(self.length / G)
        theory_f = 1.0 / theory_T

        txt = f"T理论={theory_T:.3f}s  f={theory_f:.2f}Hz"
        if self.measured_period is not None:
            txt += f"  T实测={self.measured_period:.3f}s"
        txt += f"  θ={math.degrees(self.theta):.1f}°  t={self.t:.2f}s"
        self.data_var.set(txt)

    def reset(self):
        super().reset()
        self.theta = self.theta0
        self.omega = 0.0
        self.t = 0.0
        self.theta_history.clear()
        self.time_history.clear()
        self.last_cross = None
        self.measured_period = None
        self.cross_count = 0
        self.canvas.delete("all")
        self.wave_canvas.delete("all")
        self.data_var.set("准备就绪")
        self._draw_initial()
