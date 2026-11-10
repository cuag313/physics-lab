/**
 * CircuitReadoutPanel — 实时读数面板（交互层）
 *
 * 数值全部来自同一份求解结果（MNA 解），与表盘指针完全同步：
 * 表盘负责"看起来像真表"，这里负责"给出精确值"，两者不会打架。
 *
 * 采用「轮询快照」而不是把 60fps 的电流塞进 React state：
 * 画布是 imperative 绘制的，面板只需 6~7 次/秒刷新，避免整页重渲染掉帧。
 */
import { useEffect, useState } from 'react'

const POLL_MS = 150

export default function CircuitReadoutPanel({ getSnapshot, style }) {
  const [snap, setSnap] = useState(() => (getSnapshot ? getSnapshot() : null))

  useEffect(() => {
    if (!getSnapshot) return undefined
    const tick = () => setSnap(getSnapshot())
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => clearInterval(id)
  }, [getSnapshot])

  if (!snap) return null
  const { rows = [], total, state } = snap

  return (
    <div style={{ ...styles.wrap, ...style }}>
      <div style={styles.head}>
        <span style={styles.dot(state.color)} />
        <span style={styles.title}>实时读数</span>
        <span style={{ ...styles.state, color: state.color }}>{state.text}</span>
      </div>

      <div style={styles.totalRow}>
        <span style={styles.totalLabel}>电源</span>
        <span style={styles.totalVal}>{fmt(total.voltage, 1)}<span style={styles.unit}>V</span></span>
        <span style={styles.totalLabel}>总电流</span>
        <span style={styles.totalVal}>{fmt(total.current, 3)}<span style={styles.unit}>A</span></span>
      </div>
      <div style={styles.totalRow}>
        <span style={styles.totalLabel}>等效电阻</span>
        <span style={styles.totalVal}>{fmt(total.resistance, 1)}<span style={styles.unit}>Ω</span></span>
        <span style={styles.totalLabel}>总功率</span>
        <span style={styles.totalVal}>{fmt(total.power, 2)}<span style={styles.unit}>W</span></span>
      </div>

      <div style={styles.table}>
        <div style={styles.thead}>
          <span style={{ ...styles.tc, flex: 1.4 }}>元件</span>
          <span style={styles.tc}>U/V</span>
          <span style={styles.tc}>I/A</span>
          <span style={styles.tc}>P/W</span>
        </div>
        {rows.length === 0 && <div style={styles.empty}>还没有接入元件</div>}
        {rows.map((r) => (
          <div key={r.id} style={styles.tr}>
            <span style={{ ...styles.tc, flex: 1.4, color: r.color || '#cfe0ee', fontWeight: 600 }}>{r.name}</span>
            <span style={styles.tcm}>{fmt(r.U, 2)}</span>
            <span style={styles.tcm}>{fmt(r.I, 3)}</span>
            <span style={styles.tcm}>{fmt(r.P, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function fmt(v, d) {
  if (!Number.isFinite(v)) return '--'
  const a = Math.abs(v)
  if (a >= 1000) return v.toFixed(0)
  return v.toFixed(d)
}

const styles = {
  wrap: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 214,
    padding: '8px 10px 10px',
    borderRadius: 10,
    background: 'rgba(18, 24, 29, 0.82)',
    border: '1px solid rgba(120, 160, 200, 0.28)',
    boxShadow: '0 8px 22px rgba(0,0,0,0.45)',
    backdropFilter: 'blur(5px)',
    color: '#cfdae4',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    pointerEvents: 'none',
    zIndex: 12,
  },
  head: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { fontSize: 11, fontWeight: 700, color: '#e8f1f8', letterSpacing: 0.3 },
  state: { marginLeft: 'auto', fontSize: 10, fontWeight: 700 },
  dot: (color) => ({
    width: 7, height: 7, borderRadius: '50%', background: color,
    boxShadow: `0 0 8px ${color}`,
  }),
  totalRow: {
    display: 'flex', alignItems: 'baseline', gap: 4,
    fontSize: 10, color: '#8ea4b6', marginBottom: 3,
  },
  totalLabel: { color: '#8ea4b6' },
  totalVal: {
    fontFamily: 'ui-monospace, Consolas, monospace',
    fontSize: 12, fontWeight: 700, color: '#7cc4ff', marginRight: 8,
  },
  unit: { fontSize: 9, color: '#6e8ba3', marginLeft: 1 },
  table: { marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 5 },
  thead: { display: 'flex', fontSize: 9, color: '#71889b', marginBottom: 3 },
  tr: { display: 'flex', alignItems: 'center', padding: '2px 0' },
  tc: { flex: 1, fontSize: 10, textAlign: 'right' },
  tcm: {
    flex: 1, textAlign: 'right', fontSize: 10,
    fontFamily: 'ui-monospace, Consolas, monospace', color: '#b9d3e6',
  },
  empty: { fontSize: 10, color: '#6e8ba3', padding: '4px 0' },
}
