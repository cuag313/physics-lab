# NB物理引擎逆向分析

## 技术栈
- **渲染**: PIXI.js (Canvas2D WebGL)
- **编辑器**: Snap.svg (SVG)
- **UI**: Stencil.js (Web Components)
- **矩阵运算**: 自研Matrix库（高斯消元、LU分解、矩阵求逆）
- **音频**: Howler.js

## 核心架构

### 器材系统 (TripleLayerEquipment)

```
器材 (Equipment)
├── bPsArr[]          // 连接点数组 (Binding Poster)
│   ├── bposter0      // 连接点0
│   ├── bposter1      // 连接点1
│   └── ...
├── elecUtil          // 电学工具（电路求解、拓扑管理）
├── Resistance        // 电阻值
├── Power             // 功率
├── curElec           // 当前电流
├── curPower          // 当前功率
├── isBreak           // 是否断路
├── isShortCircuit    // 是否短路
├── isVirtualBreak    // 虚断路
├── drawDis = 37      // 连接点吸附距离（像素）
└── componentBox      // PIXI显示容器
```

### 连接点系统 (BindingPoster)

```javascript
class BindingPoster {
  body          // 所属器材
  BindMC        // PIXI显示对象（圆形，半径37px）
  friendPostersArr[]  // 已连接的其他连接点
  linkPostersArr[]    // 关联的连接点
  myroad_arr[]        // 电路路径（节点电压法用）
  canStartDrawElecWire // 是否可以开始画导线
  Un                  // 节点电压
}
```

### 导线系统 (ElecWire)

- 导线是一种特殊的器材（`classname === 'ElecWire'`）
- 有两个端点，每个端点可以连接到其他器材的连接点
- 连接通过 `linkWireBindMC(bindMC1, bindMC2)` 完成
- 导线有方向性（`freshTouDirect()`）

### 电路求解流程

```
1. 用户拖拽器材到画布
2. 松手时 dragEndAutoBindWire()：
   - getNearWireBinding(poster) 查找附近连接点
   - 距离阈值: connectMinDistanceNumber
   - 自动连接最近的连接点
3. 用户手动画导线：
   - 从连接点拖出 → drawLineComp.startDrawElecWire()
   - 松手时 nearToBinding() 查找最近连接点
   - linkWireBindMC() 建立连接
4. 电路变化触发 elecUtil.elect_Update：
   - 构建电路拓扑（myroad_arr）
   - 高斯消元求解节点电压
   - 更新各器材的 curElec, curPower
5. 字段更新：
   - electricField_Update（电场线）
   - magneticField_Update（磁感线）
```

### 关键设计模式

1. **连接点吸附**: 37px圆形区域，松手自动吸附最近连接点
2. **组合器材 (ZuHe)**: 一个器材可以包含多个子电阻/电感/电容
3. **属性系统**: 每个器材有 settingPropertyList（可调参数）和 displayPropertyList（显示参数），参数有单位和公式
4. **状态管理**: isBreak（断路）、isShortCircuit（短路）、isVirtualBreak（虚断路）
5. **撤销/重做**: getData() / setData() 序列化

## 与我们系统的对比

| 方面 | NB | 我们 |
|------|-----|------|
| 连接点 | 37px圆形，自动吸附 | 8px圆形，手动点击 |
| 导线 | 特殊器材，两端连接 | Wire对象，端口引用 |
| 电路求解 | MNA + 高斯消元 | MNA + 高斯消元 ✓ |
| 器材属性 | 动态属性系统 | 固定params对象 |
| 组合器材 | ZuHe系统 | 不支持 |
| 拖拽 | PIXI原生拖拽 | Canvas坐标计算 |
| 序列化 | getData/setData | serialize() |
| 连接方式 | 拖拽松手自动连接 | 点击端口→点击端口 |

## 核心启示

1. **连接点要大**（37px vs 我们的8px），**松手自动吸附**而不是手动点两个端口
2. **导线是特殊器材**，不是简单的连线数据
3. **属性系统要动态**，支持单位和公式
4. **组合器材**是高级功能（滑动变阻器=两个电阻+滑片）
5. **PIXI.js** 提供了比原生Canvas更好的交互支持（拖拽、事件、显示列表）
