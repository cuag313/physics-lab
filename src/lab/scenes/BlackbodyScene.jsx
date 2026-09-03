import { useState } from 'react'

/**
 * BlackbodyScene — 黑体辐射光谱
 *
 * - 调节黑体温度
 * - 观察辐射光谱变化
 * - 维恩位移定律
 * - 经典理论 vs 普朗克量子解释
 */
export default function BlackbodyScene() {
  const [temperature, setTemperature] = useState(3000) // K

  // 维恩位移定律：λ_max * T = b = 2.898e-3 m·K
  const b = 2.898e-3
  const lambdaMax = b / temperature * 1e9 // nm
  // 峰值波长颜色
  const getColor = (nm) => {
    if (nm < 380) return '#8B00FF'
    if (nm < 450) return '#4400FF'
    if (nm < 495) return '#0000FF'
    if (nm < 570) return '#00FF00'
    if (nm < 590) return '#FFFF00'
    if (nm < 620) return '#FF7F00'
    if (nm < 780) return '#FF0000'
    return '#8B0000'
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>黑体辐射光谱</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>温度 T</span>
          <input type="range" min="1000" max="8000" step="100" value={temperature}
            onChange={(e) => setTemperature(parseInt(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{temperature} K</span>
        </label>
        <span style={{ fontSize: 12, color: '#FF9800', fontWeight: 600 }}>
          λ_max = {lambdaMax.toFixed(0)} nm
        </span>
        <span style={{ fontSize: 12, color: getColor(lambdaMax), fontWeight: 600 }}>
          ● {lambdaMax < 380 ? '紫外' : lambdaMax < 780 ? '可见光' : '红外'}
        </span>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>☀️</div>
          <div style={styles.placeholderTitle}>黑体辐射光谱</div>
          <div style={styles.placeholderText}>
            调节黑体温度，观察辐射光谱曲线变化<br /><br />
            <b>当前温度：</b>{temperature} K<br />
            <b>峰值波长：</b>λ_max = {lambdaMax.toFixed(0)} nm<br /><br />
            <b>维恩位移定律：</b><br />
            λ_max × T = b = 2.898×10⁻³ m·K<br />
            温度越高，峰值波长越短（蓝移）<br /><br />
            <b>斯特藩-玻尔兹曼定律：</b><br />
            总辐射功率 ∝ T⁴<br />
            温度越高，总辐射能量越大<br /><br />
            <b>紫外灾变：</b>经典理论在高频端发散<br />
            <b>普朗克量子化：</b>E = nhν 解决了紫外灾变
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：黑体辐射光谱</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节温度观察辐射光谱变化，验证维恩位移定律，对比经典理论与量子解释。
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
