import { useState } from 'react'

/**
 * ElectronDoubleSlitScene — 电子双缝干涉（波粒二象性）
 *
 * - 单电子逐点打屏累积干涉条纹
 * - 调节加速电压改变德布罗意波长
 * - 认识物质波
 */
export default function ElectronDoubleSlitScene() {
  const [voltage, setVoltage] = useState(5000) // V
  const [electronCount, setElectronCount] = useState(0)

  // 德布罗意波长 λ = h/p = h/√(2meU)
  const h = 6.626e-34
  const m = 9.109e-31
  const e = 1.602e-19
  const lambda = h / Math.sqrt(2 * m * e * voltage) * 1e12 // pm

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>电子双缝干涉 — 波粒二象性</span>
        <div style={styles.topActions}>
          <button style={styles.playBtn}>▶ 发射电子</button>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>加速电压</span>
          <input type="range" min="1000" max="10000" step="100" value={voltage}
            onChange={(e) => setVoltage(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{voltage} V</span>
        </label>
        <span style={{ fontSize: 12, color: '#4A90D9', fontWeight: 600 }}>
          λ = {lambda.toFixed(1)} pm
        </span>
        <span style={{ fontSize: 12, color: '#888' }}>
          已发射: {electronCount} 个
        </span>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>🔦</div>
          <div style={styles.placeholderTitle}>电子双缝干涉</div>
          <div style={styles.placeholderText}>
            逐个发射电子，累积形成干涉条纹<br /><br />
            <b>加速电压：</b>{voltage} V<br />
            <b>德布罗意波长：</b>λ = {lambda.toFixed(1)} pm<br /><br />
            <b>物质波公式：</b><br />
            λ = h/p = h/√(2meU)<br /><br />
            <b>实验现象：</b><br />
            单个电子 → 粒子性（打在屏幕上一个点）<br />
            大量电子累积 → 波动性（出现干涉条纹）<br /><br />
            <b>波粒二象性：</b><br />
            微观粒子同时具有粒子性和波动性<br />
            观测方式决定显现哪种性质
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：电子双缝干涉</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          逐个发射电子观察波粒二象性，调节加速电压改变德布罗意波长。
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
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 55 },
  playBtn: { background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
