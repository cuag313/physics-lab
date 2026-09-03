import { useState } from 'react'

/**
 * RelativityScene — 狭义相对论初步：时间膨胀与长度收缩
 *
 * - 高速运动参考系对比
 * - 调节运动速度
 * - 实时观察洛伦兹因子、钟慢、尺缩效应
 */
export default function RelativityScene() {
  const [beta, setBeta] = useState(0.5) // v/c

  const gamma = 1 / Math.sqrt(1 - beta * beta) // 洛伦兹因子

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>狭义相对论：时间膨胀与长度收缩</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>v/c</span>
          <input type="range" min="0" max="0.999" step="0.001" value={beta}
            onChange={(e) => setBeta(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{beta.toFixed(3)}c</span>
        </label>
        <span style={{ fontSize: 12, color: '#E53935', fontWeight: 600 }}>
          γ = {gamma.toFixed(4)}
        </span>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>🚀</div>
          <div style={styles.placeholderTitle}>狭义相对论效应</div>
          <div style={styles.placeholderText}>
            <b>运动速度：</b>v = {beta.toFixed(3)}c = {(beta * 3e8).toFixed(0)} m/s<br />
            <b>洛伦兹因子：</b>γ = 1/√(1-v²/c²) = {gamma.toFixed(4)}<br /><br />
            <b>时间膨胀（钟慢效应）：</b><br />
            Δt = γ × Δt₀<br />
            运动时钟走慢 {gamma.toFixed(2)} 倍<br />
            运动参考系1秒 = 静止参考系 {gamma.toFixed(2)} 秒<br /><br />
            <b>长度收缩（尺缩效应）：</b><br />
            L = L₀ / γ<br />
            运动方向长度收缩为静止时的 {(1/gamma).toFixed(4)} 倍<br /><br />
            {beta < 0.1 && '低速：相对论效应可忽略'}
            {beta >= 0.1 && beta < 0.9 && '中等速度：相对论效应开始显现'}
            {beta >= 0.9 && beta < 0.99 && '高速：相对论效应显著'}
            {beta >= 0.99 && '接近光速：极端相对论效应！γ → ∞'}
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：狭义相对论初步</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节运动速度接近光速，观察时间膨胀和长度收缩效应，理解洛伦兹变换。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8 },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 140, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
