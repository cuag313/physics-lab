/**
 * ConclusionCard — 实验结论卡片（魔兔「查看结论」闭环）
 *
 * 三段式：现象 → 数据 → 规律
 * 配合 DataRecorder 使用；也可单独传静态文案。
 */

export default function ConclusionCard({
  open = false,
  onToggle,
  title = '查看结论',
  phenomenon = '',
  dataRows = [],
  formula = '',
  summary = '',
  onReset = null,
  extra = null,
}) {
  return (
    <div style={styles.wrap}>
      <button type="button" style={styles.toggle} onClick={onToggle}>
        {open ? '▾ 收起结论' : `▸ ${title}`}
      </button>

      {open && (
        <div style={styles.card}>
          {phenomenon && (
            <section style={styles.block}>
              <div style={styles.label}>现象</div>
              <div style={styles.text}>{phenomenon}</div>
            </section>
          )}

          {dataRows.length > 0 && (
            <section style={styles.block}>
              <div style={styles.label}>数据</div>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {Object.keys(dataRows[0]).map((k) => (
                      <th key={k} style={styles.th}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.map((row, i) => (
                    <tr key={i}>
                      {Object.keys(dataRows[0]).map((k) => (
                        <td key={k} style={styles.td}>{row[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {formula && (
            <section style={styles.block}>
              <div style={styles.label}>规律</div>
              <div style={styles.formula}>{formula}</div>
              {summary && <div style={styles.text}>{summary}</div>}
            </section>
          )}

          {extra}

          {onReset && (
            <button type="button" style={styles.again} onClick={onReset}>
              ↺ 再做一次
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  wrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 20,
    maxWidth: 'min(360px, 92vw)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    pointerEvents: 'auto',
  },
  toggle: {
    background: '#2e7d32',
    color: '#fff',
    border: 'none',
    borderRadius: 16,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  },
  card: {
    background: 'rgba(255,255,255,0.97)',
    border: '1px solid #c8e6c9',
    borderRadius: 10,
    padding: '12px 14px',
    width: '100%',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    maxHeight: '55vh',
    overflow: 'auto',
  },
  block: { marginBottom: 10 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: '#2e7d32',
    marginBottom: 4,
    letterSpacing: 1,
  },
  text: { fontSize: 13, color: '#333', lineHeight: 1.55 },
  formula: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1b5e20',
    background: '#e8f5e9',
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 6,
    textAlign: 'center',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    borderBottom: '1px solid #c8e6c9',
    padding: '4px 6px',
    textAlign: 'left',
    color: '#555',
    fontWeight: 600,
  },
  td: {
    borderBottom: '1px solid #eee',
    padding: '4px 6px',
    color: '#333',
  },
  again: {
    marginTop: 4,
    background: '#fff',
    color: '#2e7d32',
    border: '1px solid #2e7d32',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 12,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
}
