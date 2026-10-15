import { useRef } from 'react'

/**
 * 自己动手模式的器材工具条（DOM）
 * 手机可横向滑动选择，不再把列表画进 canvas 导致裁切/叠框。
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

export default function BuilderPalette({ items = DEFAULT_ITEMS, wireColor, onPickColor, onAdd, hint }) {
  const listRef = useRef(null)

  return (
    <div style={styles.wrap}>
      <div
        ref={listRef}
        style={styles.scroll}
        className="toolbox-list"
      >
        <span style={styles.label}>器材</span>
        {items.map((it) => (
          <button
            key={it.type}
            type="button"
            style={styles.chip}
            onClick={() => onAdd && onAdd(it.type)}
            title={`添加${it.name}`}
          >
            <span style={styles.icon}>{it.icon}</span>
            <span style={styles.name}>{it.name}</span>
          </button>
        ))}
        <span style={{ ...styles.label, marginLeft: 8 }}>导线</span>
        {COLORS.map((c) => (
          <button
            key={c.color}
            type="button"
            style={{
              ...styles.chip,
              ...styles.colorChip,
              borderColor: wireColor === c.color ? c.color : 'transparent',
              background: wireColor === c.color ? `${c.color}22` : '#fff',
            }}
            onClick={() => onPickColor && onPickColor(c.color)}
          >
            <span style={{ ...styles.swatch, background: c.color }} />
            <span style={styles.name}>{c.name}</span>
          </button>
        ))}
        {hint && <span style={styles.hint}>{hint}</span>}
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    flexShrink: 0,
    borderTop: '1px solid #d0d7de',
    background: '#f6f8fa',
  },
  scroll: {
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
  colorChip: {
    padding: '6px 10px',
  },
  icon: { fontSize: 16 },
  name: { fontWeight: 600, whiteSpace: 'nowrap' },
  swatch: {
    width: 22,
    height: 12,
    borderRadius: 3,
    display: 'inline-block',
  },
  hint: {
    flexShrink: 0,
    fontSize: 11,
    color: '#8b949e',
    marginLeft: 8,
    whiteSpace: 'nowrap',
  },
}
