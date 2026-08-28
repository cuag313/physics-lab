# NB物理实验仿真平台

基于 NOBOOK 物理实验的交互式仿真平台，支持 3D 实验模拟和 NB 器件图片浏览。

## 项目结构

```
physics-lab/
├── src/                    # React Web 应用（主应用）
│   ├── components/
│   │   ├── experiments/    # 3D 实验组件（Three.js）
│   │   ├── instruments/    # 3D 仪器组件
│   │   ├── ui/             # UI 组件（实验选择器、图片浏览器）
│   │   └── common/         # 通用组件（场景、错误边界）
│   ├── stores/             # Zustand 状态管理
│   └── data/               # 实验数据注册表
├── public/
│   ├── categorized/        # 按分类整理的 NB 器件图片
│   ├── assets/icons/       # 原始 NB 器件图标（3694张）
│   └── useful-icons/       # 精选常用图标
├── physics_lab/            # Python tkinter 桌面端（独立工具）
└── sort-images.js          # 图片分类整理脚本
```

## 快速开始

### Web 应用（推荐）

```bash
npm install
npm run dev
```

访问 http://localhost:5173

### Python 桌面端

```bash
python run.py
```

## 功能特性

### 3D 仿真实验
- 抛体运动、单摆实验、欧姆定律、透镜成像等 12 个实验
- 基于 React Three Fiber 的 3D 渲染
- 实时物理模拟和交互控制
- 按学段→年级→章节→实验的树形导航

### 器件图片库
- 3694 张 NB 物理器件图片
- 按学科分类：力学、电磁学、光学、热学
- 支持搜索和大图预览

### Python 桌面端
- 独立的 tkinter 图片浏览器
- 2D 抛体运动和单摆实验
- 纯离线运行，无需网络

## 图片分类

使用 `sort-images.js` 整理图片：

```bash
node sort-images.js
```

分类结果保存在 `public/categorized/` 目录。

## 技术栈

- **前端**: React 19 + Vite + Three.js + Zustand
- **3D渲染**: React Three Fiber + Drei
- **动画**: Framer Motion
- **桌面端**: Python + tkinter + PIL
