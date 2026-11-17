import { useRef } from 'react'

/**
 * 自己动手模式的器材栏（DOM）
 * 横屏优先：放在右侧竖向滑动，把高度留给画布。
 */
const DEFAULT_ITEMS = [
  { type: 'battery', name: '电源', icon: '🔋' },
  { type: 'bulb', name: '灯泡', icon: '💡' },
  { type: 'switch', name: '开关', icon: '🔌' },
  { type: 'resistor', name: '电阻', icon: '⚡' },
  { type: 'rheostat', name: '滑变', icon: '🔧' },
  { type: 'inductor', name: '电感', icon: '🌀' },
  { type: 'capacitor', name: '电容', icon: '⚡' },
  { type: 'ammeter', name: '电流表', icon: 'Ⓐ' },
  { type: 'voltmeter', name: '电压表', icon: 'Ⓥ' },
]

const COLORS = [
  { color: '#F44336', name: '红' },
  { color: '#FFC107', name: '黄' },
  { color: '#4CAF50', name: '绿' },
]

export default function BuilderPalette({
  items = DEFAULT_ITEMS,
  wireColor,
  onPickColor,
  onAdd,
  onDropAt,       // (type, clientX, clientY) 拖到桌面上松手时按落点放置
  hint,
  side = 'right', // right | bottom
}) {
  const isRight = side === 'right'
  const dragRef = useRef(null)
  const suppressUntilRef = useRef(0)

  /* 拖拽加入：在器材上按下 → 拖进桌面 → 松手，按落点放置（onDropAt）。
   * 原地点击仍然走 onAdd；位移超过 6px 才算拖，拖完抑制一次 click，免得加两个。 */
  const handlePointerDown = (it) => (e) => {
    if (e.button !== undefined && e.button !== 0) return
    const d = { type: it.type, x0: e.clientX, y0: e.clientY, moved: false }
    dragRef.current = d
    const move = (ev) => {
      if (Math.abs(ev.clientX - d.x0) > 6 || Math.abs(ev.clientY - d.y0) > 6) d.moved = true
    }
    const up = (ev) => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!d.moved) return
      suppressUntilRef.current = performance.now() + 400   // 拖完 400ms 内的 click 不算点击
      if (onDropAt) onDropAt(d.type, ev.clientX, ev.clientY)
      else if (onAdd) onAdd(d.type)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const handleChipClick = (type) => {
    if (performance.now() < suppressUntilRef.current) return
    if (onAdd) onAdd(type)
  }

  return (
    <div style={isRight ? styles.wrapRight : styles.wrapBottom}>
      {/* 器材缩略图：icon 可直接传器材图纸渲染出的 SVG / 图片，统一按 40×24 缩放 */}
      <style>{`.bp-ic{display:flex;align-items:center;justify-content:center;height:24px}
.bp-ic svg{width:40px;height:24px}
.bp-ic img{width:40px;height:24px;object-fit:contain}`}</style>
      <div
        className="toolbox-list"
        style={isRight ? styles.scrollRight : styles.scrollBottom}
      >
        <div style={isRight ? styles.labelRight : styles.label}>器材</div>
        {items.map((it) => (
          <button
            key={it.type}
            type="button"
            style={isRight ? styles.chipRight : styles.chip}
            onPointerDown={handlePointerDown(it)}
            onClick={() => handleChipClick(it.type)}
            title={`添加${it.name}（也可直接拖到桌面）`}
          >
            <span className="bp-ic" style={styles.icon}>{it.icon}</span>
            <span style={isRight ? styles.nameRight : styles.name}>{it.name}</span>
          </button>
        ))}
        <div style={isRight ? styles.labelRight : styles.label}>导线</div>
        {COLORS.map((c) => (
          <button
            key={c.color}
            type="button"
            style={{
              ...(isRight ? styles.chipRight : styles.chip),
              borderColor: wireColor === c.color ? c.color : 'transparent',
              background: wireColor === c.color ? `${c.color}22` : '#fff',
            }}
            onClick={() => onPickColor && onPickColor(c.color)}
          >
            <span style={{ ...styles.swatch, background: c.color }} />
            <span style={isRight ? styles.nameRight : styles.name}>{c.name}</span>
          </button>
        ))}
        {hint && <div style={isRight ? styles.hintRight : styles.hint}>{hint}</div>}
      </div>
    </div>
  )
}

const styles = {
  wrapRight: {
    flexShrink: 0,
    width: 108,
    borderLeft: '1px solid #d0d7de',
    background: '#f6f8fa',
    minHeight: 0,
    display: 'flex',
  },
  wrapBottom: {
    flexShrink: 0,
    borderTop: '1px solid #d0d7de',
    background: '#f6f8fa',
  },
  scrollRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorY: 'contain',
    padding: '8px 6px',
    width: '100%',
  },
  scrollBottom: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    overflowX: 'auto',
    overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch',
    overscrollBehaviorX: 'contain',
    padding: '8px 10px',
    minHeight: 56,
  },
  label: {
    flexShrink: 0,
    fontSize: 11,
    color: '#666',
    fontWeight: 600,
  },
  labelRight: {
    fontSize: 10,
    color: '#666',
    fontWeight: 700,
    textAlign: 'center',
    padding: '2px 0 0',
    flexShrink: 0,
  },
  chip: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #d0d7de',
    background: '#fff',
    cursor: 'pointer',
    minHeight: 44,
    fontSize: 12,
    color: '#24292f',
    touchAction: 'manipulation',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  chipRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '8px 4px',
    borderRadius: 8,
    border: '1px solid #d0d7de',
    background: '#fff',
    cursor: 'pointer',
    minHeight: 52,
    width: '100%',
    fontSize: 11,
    color: '#24292f',
    touchAction: 'manipulation',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    flexShrink: 0,
  },
  icon: { fontSize: 16 },
  name: { fontWeight: 600, whiteSpace: 'nowrap' },
  nameRight: { fontWeight: 600, whiteSpace: 'nowrap', fontSize: 10 },
  swatch: {
    width: 18,
    height: 10,
    borderRadius: 3,
    display: 'inline-block',
    flexShrink: 0,
  },
  hint: {
    flexShrink: 0,
    fontSize: 11,
    color: '#8b949e',
    marginLeft: 8,
    whiteSpace: 'nowrap',
  },
  hintRight: {
    fontSize: 9,
    color: '#8b949e',
    textAlign: 'center',
    lineHeight: 1.3,
    padding: '4px 0',
    flexShrink: 0,
  },
}
