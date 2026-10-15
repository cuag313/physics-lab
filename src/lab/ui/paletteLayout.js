/**
 * Canvas 器材栏/步骤栏公共布局
 * 小屏（手机横屏常见 844×390）固定 palW=150/170 会把列表裁掉且无法滚动。
 */

export function paletteMetrics(W, H) {
  const compact = W < 760 || H < 440
  return {
    compact,
    palW: compact ? 118 : 170,
    palPad: compact ? 6 : 10,
    itemH: compact ? 30 : 44,
    itemGap: compact ? 5 : 6,
    showHints: !compact,
    fontTitle: compact ? 'bold 11px sans-serif' : 'bold 13px sans-serif',
    fontItem: compact ? 'bold 10px sans-serif' : 'bold 12px sans-serif',
    fontSmall: compact ? '9px sans-serif' : '11px sans-serif',
  }
}

/** 竖排列表可用高度内能放几行（用于截断/改双列） */
export function fitRows(availH, itemH, gap) {
  return Math.max(1, Math.floor((availH + gap) / (itemH + gap)))
}
