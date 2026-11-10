# 任务：physics-lab「电学虚拟实验室」3D 接入施工

你是本机 Windows 上的编码代理。目标仓库：`D:\PythonProject\physics-lab`。

## 第一步必做

先完整读取这份复核文档，不要跳过：

```
D:\PythonProject\physics-lab\3D诊断复核_与下一步Prompt_2026-11-10.md
```

它包含 Step 0～Step 5 的完整施工指令、每步验收判据，以及必须遵守的五条修正事项。

## 执行方式（硬性要求）

1. **按 Step 0 → Step 5 顺序执行，不许跳步、不许合并**。
2. **每完成一步就停下来汇报**，报告内容固定为四项：
   - 实际改动了哪些文件（完整路径 + 改了什么）
   - 验收判据的实测结果（命令 + 真实输出，不要写"应该通过"）
   - 遇到的阻塞或不确定项
   - 下一步准备做什么
   等我确认后再进下一步。
3. **Step 0 是纯验证步骤**：只临时加 import 验证 lab3d 能否编译，验证完必须把临时改动还原，不得顺手做别的修改。
4. 每一步结束都要跑 `npm run build` 和 `npm run test:run`，把退出码贴出来。

## 禁止事项

- **禁止 git push**。可以本地 commit，但不许推远端。
- 禁止删除任何文件；需要归档的按文档要求移到 `src/lab/_archive/`，注释说明取代关系。
- 禁止改动本任务范围外的实验场景（力学/光学/热学等）与 `registry.js` 中其它条目。
- 禁止为了让验收"看起来通过"而修改测试断言或降低判据。
- 遇到 lab3d 编译失败、或 `three/addons` 解析失败，**立即停止并报告完整错误**，不要自行降级换方案。

## 开始前的准备

1. 先 `git status --short` 确认工作区状态并贴出来。
2. 若工作区不干净，先报告，等我决定是否新建分支。
3. 记录当前 HEAD 提交号，作为回滚点。

## 参考事实（已核实，不必重复查证）

- `scenes/registry.js:120` → `electricLab3D: () => import('./ElectricSvgLabScene')`（当前是 2D 版）
- `src/lab/lab3d/` 三模块（three-render 31.7KB / svg-extrude-loader 24.6KB / verlet-wire 8.6KB）当前零外部引用
- `ElectricSvgLabScene.jsx:60-62` 只有 `.esvg-lab3d` 空 CSS，无挂载逻辑
- `three-render.js` 对外回调仅 5 个，缺开关点击/滑片拖拽/表盘读数三项
- `three-render.js:431` 用 `Math.abs`，会吞掉 `_rev`/`_over`，复刻接反不反偏的教学错误
- `stateKeyOf` 把 `f` 按 0.02 量化进指纹，拖滑片会反复异步重建
- 数据契约已核实兼容：`comps{ x, y }` 为盒左上角、`wires{ a, b }` 为 `'cid:tid'`、`solved{ _I, _V, _P, _fs }` 直接透传

现在开始：先读文档，然后执行 Step 0，完成后停下汇报。
