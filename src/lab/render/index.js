/**
 * render/index.js — 渲染层统一出口
 *
 * 分层约定（改造时请保持）：
 *   theme.js      绘制基元：渐变/投影/接线柱/玻璃/光晕（不含任何具体器材）
 *   workbench.js  环境层：深色桌面、工作区垫板
 *   parts.js      元件层：电源/灯泡/开关/电阻/滑动变阻器/电表
 *   wire.js       导线层：胶皮铜线、插头护套、电流粒子流
 *   needle.js     表盘动力学：阻尼指针 + 教学量程表
 *
 * 这一层不认识电路拓扑，只接收「画什么、画在哪、当前读数」，
 * 因此可以脱离仿真单独复用（其它实验的器材也能用同一套基元）。
 */

export * from './theme.js'
export * from './workbench.js'
export * from './parts.js'
export * from './wire.js'
export * from './needle.js'
