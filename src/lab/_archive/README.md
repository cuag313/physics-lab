# _archive — 已下线的 3D 渲染栈

本目录存放已停止使用、但保留备查的代码。**这里的任何文件都不应被 `src` 下其他模块 import**，vite 不会把它们打进产物。

## 为什么归档

项目里同时存在 5 套 3D 实现，其中只有 2 套在真实使用：

| 栈 | 位置 | 状态 |
|---|---|---|
| `simple3d` | `src/lab/simple3d/` | **在用**，`scenes/SimpleCircuitScene.jsx` 引用 |
| `lab3d` | `src/lab/lab3d/` | **在用**，`scenes/ElectricSvgLabScene.jsx` 的 3D 实验台 |
| `sandbox3d` | `src/lab/sandbox3d/` | **部分在用**，见下方说明，故未归档 |
| `three` | 已归档至 `three-legacy/` | 孤儿，唯一引用方 ElectricLab3DScene 自身也无 registry 入口 |
| `render/three-render.js` | 已归档为 `app-three-render-legacy.js` | 孤儿，只建空台面 |

## 本目录内容

### `app-three-render-legacy.js`
原 `src/render/three-render.js` 的 `ThreeLab` 类。它建了场景、灯光、相机和桌台，
但 `addComponentAt()` 从无调用方 —— 切到 3D 时看到的就是一张没有器材的空台面。
它原被 `App.jsx` 的全局悬浮「平面画布 / 3D实验台」切换条使用，该入口已在提交
`b47b807` 中移除（它会盖在所有场景页上，把用户从真正可用的 3D 引到死路）。

### `three-legacy/`
原 `src/lab/three/`：`ImageInstruments3D.jsx`、`ImageCards3d.jsx`、`RealInstruments3D.jsx`、
`ElectricInstruments3D.jsx`。只被 `scenes/ElectricLab3DScene.jsx` 引用，而该场景不在
`scenes/registry.js` 中，因此整条链从未进入过依赖图。

### `scenes-legacy/`
- `ElectricLab3DScene.jsx` —— 3D 拟物实验台，器材位置与导线坐标是硬编码的演示台面，
  不能承担自由搭建的目标形态；无 registry 入口。
- `ElectricLab3DSandbox.jsx` —— 仅把 `sandbox3d/Sandbox3D.jsx` 包了一层，无 registry 入口。

## 为什么 `sandbox3d` 没有归档

旧诊断认为 `sandbox3d` 只被 `ElectricLab3DSandbox.jsx` 引用，属于孤儿。实测不成立：

- `src/lab/simple3d/Builder3D.jsx:15` → `import { Wire3D, WirePreview } from '../sandbox3d/wires3d.jsx'`（**在用**）
- `src/lab/sandbox/CircuitSandbox.jsx:20` → `import { useCircuitStore } from '../sandbox3d/store.js'`（**在用**）

整块移走会切断这两条活引用。其中 `sandbox3d/Sandbox3D.jsx` 及其依赖的
`components3d/`、`stage.jsx`、`model3d.js`、`catalog3d.js` 目前已无外部引用
（孤儿），可在后续单独处理；`store.js` 与 `wires3d.jsx` 必须留在原位。

## 如何恢复某个文件

1. 把文件移回原路径（例如 `app-three-render-legacy.js` → `src/render/three-render.js`）。
2. 若原路径是 `scenes/ElectricLab3DScene.jsx`，需要在 `src/lab/index.js` 恢复被删掉的两行导出：
   ```js
   export { default as ElectricLab3DScene } from './scenes/ElectricLab3DScene'
   export * from './three/ElectricInstruments3D'
   ```
3. 重新跑 `npm run lint` / `npm run build` 确认无引用错误。
