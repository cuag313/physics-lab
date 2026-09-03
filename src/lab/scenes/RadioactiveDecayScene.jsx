import { useState } from 'react'

/**
 * RadioactiveDecayScene — 放射性衰变与半衰期模拟
 *
 * 虚拟原子核衰变统计
 * - α、β、γ射线穿透对比
 * - 辐射防护模拟
 * - 无真实放射源
 */
export default function RadioactiveDecayScene() {
  const [atomCount] = useState(200)
  const [halfLife, setHalfLife] = useState(5)
  const [decayType, setDecayType] = useState('alpha')
  const [shield, setShield] = useState('none')

  const shields = {
    none: { name: '无屏蔽', alpha: 1, beta: 1, gamma: 1 },
    paper: { name: '纸张', alpha: 0, beta: 0.8, gamma: 0.95 },
    aluminum: { name: '铝板', alpha: 0, beta: 0.1, gamma: 0.7 },
    lead: { name: '铅板', alpha: 0, beta: 0, gamma: 0.1 },
  }

  const currentShield = shields[shield]
  const penetration = decayType === 'alpha' ? currentShield.alpha : decayType === 'beta' ? currentShield.beta : currentShield.gamma

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>放射性衰变与半衰期模拟</span>
        <div style={styles.topActions}>
          <button style={styles.playBtn}>▶ 开始衰变</button>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>半衰期</span>
          <input type="range" min="1" max="20" step="1" value={halfLife}
            onChange={(e) => setHalfLife(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{halfLife} s</span>
        </label>
        <div style={styles.sep} />
        <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>射线类型：</span>
        {[['alpha', 'α射线'], ['beta', 'β射线'], ['gamma', 'γ射线']].map(([k, l]) => (
          <button key={k} style={decayType === k ? styles.tabActive : styles.tab} onClick={() => setDecayType(k)}>{l}</button>
        ))}
        <div style={styles.sep} />
        <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>屏蔽物：</span>
        {Object.entries(shields).map(([k, v]) => (
          <button key={k} style={shield === k ? styles.tabActive : styles.tab} onClick={() => setShield(k)}>{v.name}</button>
        ))}
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>☢️</div>
          <div style={styles.placeholderTitle}>放射性衰变与半衰期</div>
          <div style={styles.placeholderText}>
            虚拟原子核衰变统计（无真实放射源）<br />
            初始原子核: {atomCount} 个<br />
            半衰期 T₁/₂ = {halfLife} s<br /><br />
            <b>衰变规律：</b>N = N₀ × (1/2)^(t/T₁/₂)<br /><br />
            <b>三种射线穿透力：</b><br />
            α射线：一张纸即可挡住<br />
            β射线：几毫米铝板可挡住<br />
            γ射线：需要很厚铅板<br /><br />
            当前屏蔽: {currentShield.name}<br />
            {decayType.toUpperCase()}射线穿透率: {(penetration * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：放射性衰变与半衰期</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          观察大量原子核衰变的统计规律，理解半衰期概念，对比三种射线穿透能力。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 6, overflowX: 'auto' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 80, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  sep: { width: 1, height: 18, background: '#ccc' },
  tab: { background: '#fff', color: '#555', border: '1px solid #ccc', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' },
  tabActive: { background: '#4A90D9', color: '#fff', border: '1px solid #4A90D9', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
