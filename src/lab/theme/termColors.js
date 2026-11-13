/**
 * 接线柱柱帽配色 —— 全项目唯一来源。
 *
 * 约定：**位于器材右侧（正极 / 后接端）的柱帽一律红色，左侧（负极 / 前端）一律黑色。**
 * 纵向排布、没有左右之分的柱位（验电器的球 / 地、继电器的线圈 圈1 / 圈2）不套用此约定。
 *
 * 以前各处自己写色值（#c0392b / #e53935 / #f44 / #44f / #aaa 混用），
 * 同一台桌面上出现三种红、负极还有蓝色，故收敛到这里。新增器材请引用这里的常量。
 */
export const CAP_RED = '#c0392b' // 右 / 正极柱帽
export const CAP_BLACK = '#1c1f24' // 左 / 负极柱帽
export const CAP_RED_EDGE = '#7f1d1d' // 红帽描边
export const CAP_BLACK_EDGE = '#0b0d10' // 黑帽描边

/** 按"是否深色（左/负）"返回柱帽的填充与描边 */
export function capPaint(dark) {
  return dark
    ? { fill: CAP_BLACK, stroke: CAP_BLACK_EDGE }
    : { fill: CAP_RED, stroke: CAP_RED_EDGE }
}
