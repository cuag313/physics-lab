import { useState } from 'react'

/**
 * ComptonScene — 康普顿散射
 *
 * - 光子与自由电子碰撞
 * - 改变散射角观察光子波长偏移
 * - 验证光的粒子性
 */
export default function ComptonScene() {
  const [angle, setAngle] = useState(45) // 散射角（度）

  const h = 6.626e-34
  const m_e = 9.109e-31
  const c = 3e8
  const lambda_c = h / (m_e * c) * 1e12 // 康普顿波长 pm

  // 波长偏移 Δλ = λ_c (1 - cosθ)
  const deltaLambda = lambda_c * (1 - Math.cos(angle * Math.PI / 180))

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>康普顿散射</span>
        <div style={styles.topActions}>
          <button style={styles.playBtn}>▶ 发射光子</button>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>散射角 θ</span>
          <input type="range" min="0" max="180" step="1" value={angle}
            onChange={(e) => setAngle(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{angle}°</span>
        </label>
        <span style={{ fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
          Δλ = {deltaLambda.toFixed(2)} pm
        </span>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>💫</div>
          <div style={styles.placeholderTitle}>康普顿散射</div>
          <div style={styles.placeholderText}>
            光子与自由电子碰撞，改变散射角观察波长偏移<br /><br />
            <b>散射角：</b>θ = {angle}°<br />
            <b>康普顿波长：</b>λ_c = {lambda_c.toFixed(2)} pm<br />
            <b>波长偏移：</b>Δλ = λ_c(1-cosθ) = {deltaLambda.toFixed(2)} pm<br /><br />
            <b>康普顿公式：</b><br />
            Δλ = λ_c (1 - cosθ)<br />
            λ_c = h/(mₑc) = 2.426 pm<br /><br />
            <b>物理意义：</b><br />
            光子像粒子一样与电子碰撞<br />
            散射后光子波长变长（能量减小）<br />
            验证了光的粒子性<br /><br />
            {angle === 0 && 'θ=0°：无偏转，波长不变'}
            {angle === 90 && 'θ=90°：Δλ = λ_c'}
            {angle === 180 && 'θ=180°：反向散射，Δλ = 2λ_c（最大偏移）'}
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：康普顿散射</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          改变散射角，观察光子波长偏移，验证康普顿公式和光的粒子性。
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
  slider: { width: 120, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 40 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
