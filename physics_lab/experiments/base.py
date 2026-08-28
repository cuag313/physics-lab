"""实验基类"""
import tkinter as tk


class BaseExperiment:
    """所有实验的基类"""

    name = "未命名实验"
    description = ""
    objectives = []

    def __init__(self, parent):
        self.parent = parent
        self.frame = tk.Frame(parent)
        self.running = False
        self._after_id = None

    def build_ui(self):
        """构建实验界面，子类必须实现"""
        raise NotImplementedError

    def start(self):
        """开始实验"""
        self.running = True

    def stop(self):
        """停止实验"""
        self.running = False
        if self._after_id is not None:
            self.frame.after_cancel(self._after_id)
            self._after_id = None

    def reset(self):
        """重置实验"""
        self.stop()

    def destroy(self):
        """销毁"""
        self.stop()
        self.frame.destroy()
