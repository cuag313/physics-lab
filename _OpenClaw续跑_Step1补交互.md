# 续跑任务：补齐 3D 实验台的三个交互回调（Step 1 补篇）

项目绝对路径：`D:\PythonProject\physics-lab`（所有读写都在这里，动手前先切到该目录）
回滚点：commit `c100827`

## 一、上一轮的实际结果（已由外部核验，以此为准）

上一轮你做到 Step 1 的场景侧胶水就因超时中断了（`agents.defaults.timeoutSeconds` 已调到 1800，本轮不会再被掐）。

已核验事实：

1. 你的 9 处编辑**已干净落盘**，仅改 `src/lab/scenes/ElectricSvgLabScene.jsx`，+86 / −2，无临时文件、无备份残留。
2. 验收已被外部补跑并通过：`npm run lint` 281 warnings / **0 errors**；`npm run build` 成功，产物中出现 `ElectricSvgLabScene-DkVgqfBm.js 112.75 kB`——说明 lab3d 确实进入了 vite 依赖图。
3. 场景侧挂载代码本身是对的：5 个回调接全、`dispose()` 有、WebGL 失败会回退 2D、`bulbRated: CFG.BULB_RATED`（1.8）传对、`.esvg-lab3d` 容器有尺寸。
4. **但你播报的“API 契约确认无缺”不成立。** 实测 `three-render.js` 里 `onSwitch` / `onSlider` / `onMeter` 各 **0 处**。对外回调只有 5 个（`onCompMove` / `onCompRotate` / `onSelect` / `onWireConnect` / `onWireDelete`），缺三个做实验必需的操作：
   - 点击开关切换 `closed`
   - 拖动滑片改变 `pos`（小幅连续拖动，**不要每动一次就触发 rebuildComp**）
   - 双击表盘切换 `showRead`（现有 `onDblClick` 只做相机 tween，不读数）
   这三个逻辑目前只存在于 2D 命中函数 `ElectricSvgLabScene.jsx:592-617`。
5. 你把 `view3d` 默认设成了 `true`，而上述交互未通——当前是“看得见、做不成实验”的状态。

## 二、本轮只做三件事

**A. `three-render.js` 增加三个对外回调并接通**
- 新增 `opt.onSwitch(id, closed)` / `opt.onSlider(id, pos)` / `opt.onMeterRead(id, next)`
- 在开关网格、滑片手柄、表盘三个命中点里调用（鼠标抬起 / 双击）
- 同时修 `three-render.js:431`：`const val = Math.abs(isA ? o._I : o._V)` 改为保留符号，并读 `_rev` / `_over` 旗标驱动“接反”“超量程”表现——现在符号被吃掉，表针永远正向偏

**B. 场景侧接这三个回调**
- 接到与 2D **完全相同**的处理逻辑：复用同一个 handler，**禁止复制第二份实现**
- 保持 `handlersRef` 转发模式，保证渲染器拿到最新闭包

**C. `view3d` 默认值改为 `false`**
- 验收通过前不默认 3D；2D 仍是默认视图

## 三、验收（必须贴真实输出，不许只写“通过”）

1. `npm run lint` → 必须 0 error
2. `npm run build` → 必须成功
3. 逐项手测（3D 模式下）：
   - 点开关 → `closed` 翻转，灯泡随之亮灭
   - 拖滑片 → 阻值、电流、指针三者同步变化，且拖动过程中**不卡不闪**
   - 双击表盘 → 读数切换
   任一不通就**停下报阻塞**，不要继续下一步。

## 四、禁止

- 禁止 `git commit` / `git push`
- 禁止改 Step 2 及之后的内容
- 禁止改测试断言来凑验收
- 禁止删文件

完成后按信封要求汇报四项：改了哪些文件、验收命令+真实输出、阻塞项、下一步。然后停下等我确认。
