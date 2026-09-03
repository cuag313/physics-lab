import { useState } from 'react'

/**
 * NuclearReactionScene — 核裂变与核聚变模拟
 *
 * - 链式反应条件模拟
 * - 裂变/聚变动画
 * - 质量亏损与质能方程
 */
export default function NuclearReactionScene() {
  const [mode, setMode] = useState('fission') // 'fission' | 'fusion'

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>核裂变与核聚变模拟</span>
        <div style={styles.topActions}>
          <button style={styles.playBtn}>▶ 模拟</button>
          <button style={styles.setBtn}>⚙ 重置</button>
          <div style={styles.sep} />
          <button style={mode === 'fission' ? styles.tabActive : styles.tab} onClick={() => setMode('fission')}>核裂变</button>
          <button style={mode === 'fusion' ? styles.tabActive : styles.tab} onClick={() => setMode('fusion')}>核聚变</button>
        </div>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>{mode === 'fission' ? '💥' : '☀️'}</div>
          <div style={styles.placeholderTitle}>{mode === 'fission' ? '核裂变' : '核聚变'}</div>
          <div style={styles.placeholderText}>
            {mode === 'fission' ? (
              <>
                <b>铀-235裂变：</b><br />
                ²³⁵U + n → ¹⁴¹Ba + ⁹²Kr + 3n + 能量<br /><br />
                <b>链式反应条件：</b><br />
                临界体积/临界质量<br />
                中子再生率 ≥ 1<br /><br />
                <b>应用：</b>核电站、原子弹
              </>
            ) : (
              <>
                <b>氘氚聚变：</b><br />
                ²H + ³H → ⁴He + n + 能量<br /><br />
                <b>聚变条件：</b><br />
                极高温（{'>'} 10⁸ K）<br />
                足够高的等离子体密度<br /><br />
                <b>应用：</b>氢弹、太阳能源、可控核聚变
              </>
            )}
            <br /><br />
            <b>质能方程：</b>E = mc²<br />
            <b>质量亏损：</b>Δm → ΔE = Δm × c²
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：核裂变与核聚变</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          模拟链式反应条件，演示裂变聚变过程，理解质量亏损与质能方程。
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', maxHeight: '100vh', background: '#e8e8e8', color: '#333', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', overflow: 'hidden' },
  topBar: { background: '#f5f5f5', borderBottom: '1px solid #ccc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', flexShrink: 0, flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
  topActions: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
