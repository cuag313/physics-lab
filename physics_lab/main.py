"""物理实验室 - 入口"""
import sys
import os

# 将当前目录加入 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import PhysicsLabApp


def main():
    print("物理实验室 v0.1 启动中...")
    print("  - 无需网络，纯离线运行")
    print("  - 纯 Python + tkinter，无额外依赖")
    app = PhysicsLabApp()
    app.run()


if __name__ == "__main__":
    main()
