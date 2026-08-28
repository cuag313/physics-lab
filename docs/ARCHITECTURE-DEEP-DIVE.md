# NB与Algodoo 核心架构深度分析

## 一、NOBOOK (NB) 内部架构

### 1.1 技术栈
- **渲染层**: 2D Canvas（主实验区） + Three.js（3D器材展示）
- **物理引擎**: 自研分领域引擎（非通用物理引擎）
- **前端框架**: Webpack打包，模块化场景系统
- **3D Demo**: NB3DDemo — 每个器材/场景是独立chunk（如`phy3d-AmmeterScene`、`phy3d-MirroScene`）

### 1.2 核心架构：器材+引擎+场景 三层分离

```
┌──────────────────────────────────────────────┐
│              场景层 (Scene)                    │
│  每个实验 = 一个Scene类                        │
│  负责：器材组装、布局、交互逻辑、数据面板        │
├──────────────────────────────────────────────┤
│              器材层 (Instrument)               │
│  每个器材 = 一个独立模块                       │
│  负责：自身渲染、参数、状态、与其他器材的连接    │
│  例：Ammeter、Voltmeter、Lens、Candle         │
├──────────────────────────────────────────────┤
│              引擎层 (Engine)                   │
│  分领域引擎，各自独立                          │
│  ┌──────────┬──────────┬──────────┐          │
│  │ 电学引擎  │ 光学引擎  │ 力学引擎  │          │
│  │ 电路求解  │ 光线追踪  │ 运动模拟  │          │
│  │ 串并联    │ 折射反射  │ 碰撞检测  │          │
│  └──────────┴──────────┴──────────┘          │
└──────────────────────────────────────────────┘
```

### 1.3 NB电学引擎核心逻辑

```
电路求解流程：
1. 用户拖拽器材到实验台 → 器材自动"吸附"到电路节点
2. 检测器材之间的连线 → 构建电路拓扑图（邻接表）
3. 基尔霍夫定律求解：
   - 列KCL方程（节点电流守恒）
   - 列KVL方程（回路电压守恒）
   - 解线性方程组 → 得到各支路电流/电压
4. 实时更新仪表读数（电流表、电压表）
5. 拖动变阻器滑片 → 参数变化 → 重新求解 → 读数实时更新
```

**关键设计：**
- 器材有"端口"概念（正极、负极），端口之间通过导线连接
- 电路求解用**节点电压法**或**改进节点分析法(MNA)**
- 每次参数变化都触发重新求解（实时性要求<16ms）

### 1.4 NB光学引擎核心逻辑

```
光线追踪流程：
1. 光源（蜡烛/激光笔）→ 发射N条光线（扇形分布）
2. 每条光线 = 一条射线（起点 + 方向）
3. 逐条处理：
   a. 求交：光线与所有光学元件求交（透镜、面镜、棱镜）
   b. 折射/反射：根据元件类型和斯涅尔定律计算新方向
   c. 继续：折射后的光线继续传播，重复a-b
   d. 终止：光线到达光屏/超出边界/达到最大弹射次数
4. 光屏成像：统计到达光屏的光线汇聚点 → 形成实像
5. 虚像：折射光线反向延长 → 汇聚点 = 虚像位置
```

**关键设计：**
- 薄透镜近轴近似：入射光线高度h << 焦距f时，折射公式简化为：h' = h - h·d/f（d为到透镜距离）
- 不是精确的斯涅尔定律，而是**近轴近射线光学**——对教学场景足够精确
- 光屏是一个"探测器"：统计到达的光线，计算汇聚点

### 1.5 NB器材系统设计

```
器材基类：
{
  id: 唯一标识,
  type: 'ammeter'|'voltmeter'|'lens'|...,
  ports: [{name, position, connectedTo}],  // 端口
  params: {resistance, focalLength, ...},   // 可调参数
  state: {reading, isOn, ...},             // 运行时状态
  render(ctx, x, y),                       // Canvas2D绘制
  update(dt),                              // 每帧更新
  onDrag(dx, dy),                          // 拖拽响应
  connect(otherInstrument, port),          // 连接到其他器材
}

器材之间的关系：
- 电学器材：通过"导线"连接端口 → 形成电路
- 光学器材：通过"光路"连接 → 光线从一个器材传播到另一个
- 力学器材：通过"接触/碰撞"连接 → 力的传递
```

---

## 二、Algodoo 内部架构

### 2.1 技术栈
- **物理引擎**: AGX Dynamics（Algoryx自研，基于变分积分器）
- **渲染**: 纯2D Canvas，卡通风格
- **核心特性**: 实时多物理场耦合（刚体+流体+弹簧+铰链+光学）

### 2.2 AGX引擎核心原理

**变分积分器 (Variational Integrator)**：
- 不是传统的"力→加速度→速度→位置"的欧拉/龙格-库塔积分
- 而是基于**离散拉格朗日力学**：
  - 定义离散作用量 S_d = Σ L_d(q_k, q_{k+1})
  - 对S_d取极值 → 得到离散欧拉-拉格朗日方程
  - 优势：能量守恒性好、长时间稳定、大步长可用

**非光滑力学 (Nonsmooth Mechanics)**：
- 碰撞、接触、干摩擦 = 不连续事件
- 传统方法：用弹簧 penalty 近似 → 需要极小时间步
- AGX方法：用**硬不等式约束** + **隐式求解**：
  - 碰撞瞬间：直接计算冲量（不模拟碰撞过程）
  - 接触力：满足 Coulomb 摩擦锥约束
  - 全局求解：所有约束同时满足（不是逐个处理）

### 2.3 Algodoo交互模型

```
用户操作 → 物理响应 循环：
1. 用户绘制几何体 → 自动赋予物理属性（质量、摩擦、弹性）
2. 用户拖动物体 → 施加力/约束 → 引擎实时计算
3. 每帧：
   a. 碰撞检测（AABB broad-phase + 精确 narrow-phase）
   b. 约束求解（接触力、关节力、摩擦力）
   c. 积分更新（位置、速度）
   d. 渲染（Canvas2D绘制所有物体）
4. 光学部分独立：
   a. 光线从光源发射
   b. 与几何体表面求交
   c. 根据材质属性计算反射/折射
   d. 绘制光线路径
```

### 2.4 Algodoo光学系统

```
光学元件类型：
- 激光笔：发射单条/多条平行光线
- 点光源：发射扇形光线
- 透镜：折射（自动计算焦点）
- 面镜：反射
- 棱镜：折射+色散
- 任意几何体：根据材质属性（折射率n）折射/反射

光线追踪算法：
1. 光线 = {origin, direction, wavelength, intensity}
2. 求交：光线与所有几何体的边界求交
   - 圆形(透镜截面)：解析解
   - 多边形：逐边求交
3. 折射：Snell定律 n1·sinθ1 = n2·sinθ2
4. 全反射：当 θ > θ_c 时，全反射
5. 色散：不同波长 → 不同折射率 → 彩虹效果
6. 焦散：光线汇聚形成的亮斑
```

---

## 三、我们的架构设计（融合NB+Algodoo优势）

### 3.1 核心设计原则

1. **NB的器材组装模型** + **Algodoo的实时物理**
2. **分领域引擎**（不是通用物理引擎，针对教学场景优化）
3. **Canvas2D为主**（光学/电学/力学的2D实验）
4. **60fps实时循环**（不是公式计算+静态渲染）

### 3.2 引擎架构

```
┌─────────────────────────────────────────────────────┐
│                    应用层 (App)                       │
│  实验组件（ConvexLensExperiment, OhmsLaw, ...）       │
│  UI层（ControlPanel, DataCard, ParamSlider）          │
├─────────────────────────────────────────────────────┤
│                    场景层 (Scene)                      │
│  PhysicsScene — 管理所有器材、运行物理循环             │
│  - addInstrument(instrument)                          │
│  - removeInstrument(id)                               │
│  - step(dt) — 每帧调用，驱动所有引擎                  │
│  - render(ctx) — 渲染所有器材                         │
├─────────────────────────────────────────────────────┤
│                    器材层 (Instrument)                 │
│  InstrumentBase {                                     │
│    id, type, x, y, params, state,                     │
│    ports[],                                           │
│    update(dt), render(ctx),                           │
│    onPointerDown/Move/Up(event)                       │
│  }                                                    │
│  电学: Ammeter, Voltmeter, Battery, Resistor, ...     │
│  光学: LightSource, Lens, Mirror, Screen, ...         │
│  力学: Spring, Mass, Pulley, Lever, ...               │
├─────────────────────────────────────────────────────┤
│                    引擎层 (Engine)                     │
│  ┌──────────────┬──────────────┬──────────────┐      │
│  │ CircuitEngine │ OpticsEngine │ MechanicsEngine│     │
│  │ 电路拓扑      │ 光线追踪     │ 刚体动力学     │     │
│  │ MNA求解       │ 折射/反射    │ 碰撞检测       │     │
│  │ 串并联        │ 光屏成像     │ 弹簧/重力      │     │
│  └──────────────┴──────────────┴──────────────┘      │
├─────────────────────────────────────────────────────┤
│                    渲染层 (Renderer)                   │
│  Canvas2DRenderer {                                   │
│    clear(), drawGrid(), drawInstrument(inst),         │
│    drawRay(ray), drawWire(wire), ...                  │
│  }                                                    │
├─────────────────────────────────────────────────────┤
│                    交互层 (Interaction)                │
│  DragManager {                                        │
│    handlePointerDown/Move/Up(event),                  │
│    snapToGrid(pos), snapToRail(pos),                  │
│    connectPorts(port1, port2)                         │
│  }                                                    │
└─────────────────────────────────────────────────────┘
```

### 3.3 光学引擎详细设计

```javascript
class OpticsEngine {
  constructor() {
    this.sources = [];      // 光源
    this.elements = [];     // 光学元件（透镜、面镜、棱镜）
    this.detectors = [];    // 探测器（光屏）
    this.rays = [];         // 当前所有光线段
  }

  // 核心：每帧调用
  step() {
    this.rays = [];
    for (const source of this.sources) {
      const emitted = source.emit(); // 发射N条光线
      for (const ray of emitted) {
        this.traceRay(ray, 0); // 递归追踪
      }
    }
    // 光屏成像
    for (const detector of this.detectors) {
      detector.collectRays(this.rays);
    }
  }

  // 递归光线追踪
  traceRay(ray, depth) {
    if (depth > 10) return; // 最大弹射次数
    
    // 1. 求交：与所有元件求最近交点
    let nearest = null;
    let nearestDist = Infinity;
    for (const elem of this.elements) {
      const hit = elem.intersect(ray);
      if (hit && hit.t < nearestDist) {
        nearest = hit;
        nearestDist = hit.t;
      }
    }
    
    if (!nearest) {
      // 没有交点，光线延伸到边界
      this.rays.push({ from: ray.origin, to: ray.endpoint(100), color: ray.color });
      return;
    }
    
    // 2. 记录光线段（从起点到交点）
    this.rays.push({ from: ray.origin, to: nearest.point, color: ray.color });
    
    // 3. 根据元件类型计算折射/反射
    const result = nearest.element.refract(ray, nearest);
    if (result) {
      // 4. 继续追踪折射/反射光线
      this.traceRay(result.refractedRay, depth + 1);
      if (result.reflectedRay) {
        this.traceRay(result.reflectedRay, depth + 1);
      }
    }
  }
}

// 薄透镜
class ThinLens {
  constructor(x, y, focalLength, radius) {
    this.x = x; this.y = y;
    this.f = focalLength;
    this.radius = radius; // 透镜半径
  }
  
  intersect(ray) {
    // 光线与透镜平面（x = this.x）求交
    // 只有在透镜半径范围内才有效
    const dx = this.x - ray.origin.x;
    if (Math.abs(ray.direction.x) < 0.001) return null;
    const t = dx / ray.direction.x;
    if (t < 0) return null;
    const hitY = ray.origin.y + ray.direction.y * t;
    if (Math.abs(hitY - this.y) > this.radius) return null;
    return { t, point: { x: this.x, y: hitY }, element: this };
  }
  
  refract(ray, hit) {
    // 薄透镜近轴近似
    // 入射高度 h = hit.y - this.y
    // 折射后方向：指向焦点（平行光）或根据物距计算
    const h = hit.point.y - this.y;
    const u = hit.point.x - ray.origin.x; // 物距
    const v = (u * this.f) / (u - this.f); // 像距
    
    // 简化：折射后方向 = 从hit.point指向(this.x + v, this.y - h*v/u)
    // 或者用公式：出射斜率 = 入射斜率 - h/f
    const inSlope = ray.direction.y / ray.direction.x;
    const outSlope = inSlope - h / this.f;
    
    const refractedRay = new Ray(
      hit.point,
      { x: 1, y: outSlope }, // 方向
      ray.color
    );
    return { refractedRay };
  }
}
```

### 3.4 电学引擎详细设计

```javascript
class CircuitEngine {
  constructor() {
    this.components = []; // 电路元件
    this.nodes = new Map(); // 节点 → 连接的元件列表
    this.solution = null; // 求解结果
  }

  // 构建电路拓扑
  buildTopology() {
    this.nodes.clear();
    for (const comp of this.components) {
      for (const port of comp.ports) {
        if (!this.nodes.has(port.nodeId)) {
          this.nodes.set(port.nodeId, []);
        }
        this.nodes.get(port.nodeId).push({ component: comp, port });
      }
    }
  }

  // MNA求解（改进节点分析法）
  solve() {
    // 1. 选择参考节点（地）
    // 2. 列KCL方程：对每个非参考节点，ΣI = 0
    // 3. 用元件的V-I关系代入：
    //    - 电阻：I = V/R
    //    - 电压源：V = E（附加方程）
    //    - 电流源：I = I_s
    // 4. 解线性方程组 Ax = b
    //    x = [V1, V2, ..., I_vs1, I_vs2, ...]
    // 5. 更新各元件的电流/电压
    
    const A = this.buildMatrix();
    const b = this.buildVector();
    const x = gaussianElimination(A, b);
    this.updateReadings(x);
  }

  // 高斯消元法
  gaussianElimination(A, b) {
    const n = A.length;
    // 前向消元
    for (let col = 0; col < n; col++) {
      // 选主元
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
      }
      [A[col], A[maxRow]] = [A[maxRow], A[col]];
      [b[col], b[maxRow]] = [b[maxRow], b[col]];
      // 消元
      for (let row = col + 1; row < n; row++) {
        const factor = A[row][col] / A[col][col];
        for (let j = col; j < n; j++) A[row][j] -= factor * A[col][j];
        b[row] -= factor * b[col];
      }
    }
    // 回代
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = b[i];
      for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j];
      x[i] /= A[i][i];
    }
    return x;
  }
}
```

### 3.5 实时物理循环

```javascript
class PhysicsScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.instruments = [];
    this.engines = {
      optics: new OpticsEngine(),
      circuit: new CircuitEngine(),
      mechanics: new MechanicsEngine(),
    };
    this.renderer = new Canvas2DRenderer(canvas);
    this.dragManager = new DragManager(canvas);
    this.lastTime = 0;
    this.running = false;
  }

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // 1. 物理更新
    this.step(dt);

    // 2. 渲染
    this.render();

    requestAnimationFrame(() => this.loop());
  }

  step(dt) {
    // 更新所有引擎
    for (const engine of Object.values(this.engines)) {
      engine.step(dt);
    }
    // 更新所有器材状态
    for (const inst of this.instruments) {
      inst.update(dt);
    }
  }

  render() {
    this.renderer.clear();
    this.renderer.drawGrid();
    
    // 绘制所有器材
    for (const inst of this.instruments) {
      inst.render(this.renderer.ctx);
    }
    
    // 绘制光路
    for (const ray of this.engines.optics.rays) {
      this.renderer.drawRay(ray);
    }
    
    // 绘制电路连线
    for (const wire of this.engines.circuit.wires) {
      this.renderer.drawWire(wire);
    }
  }
}
```

---

## 四、实现优先级

### P0（必须先做）：光学引擎重构
- 凸透镜实验是突破口
- 实现真正的光线追踪（逐条发射→求交→折射→继续）
- 光屏成像 + 虚像显示
- 拖拽交互 + 实时光路更新

### P1：电学引擎
- 电路拓扑构建
- MNA求解器
- 实时仪表读数
- 拖拽连线

### P2：力学引擎
- 刚体运动
- 碰撞检测
- 弹簧/重力

### P3：教学增强
- 实验步骤引导
- 数据导出
- AI辅助
