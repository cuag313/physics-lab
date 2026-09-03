import { useState } from 'react'

/**
 * PhotoelectricScene — 光电效应与普朗克常量测定
 *
 * 模拟光电管实验：
 * - 调节光频率、光强、反向电压
 * - 测绘 I-U 曲线
 * - 测定遏止电压，拟合普朗克常量
 */
export default function PhotoelectricScene() {
  const [freq, setFreq] = useState(6e14)
  const [intensity, setIntensity] = useState(50)
  const [voltage, setVoltage] = useState(0)
  const [running, setRunning] = useState(false)

  // 电子电荷
  const e = 1.6e-19
  // 普朗克常量
  const h = 6.626e-34
  // 逸出功（铯：2.14eV）
  const W0 = 2.14 * e
  // 截止频率
  const f0 = W0 / h
  // 最大初动能
  const Ek_max = Math.max(0, h * freq - W0)
  // 遏止电压
  const Uc = Ek_max / e
  // 光电流（简化模型）
  const I = freq > f0 ? Math.max(0, intensity * 0.01 * (1 - Math.max(0, -voltage) / (Uc + 0.01))) : 0

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>光电效应与普朗克常量测定</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>光频率</span>
          <input type="range" min="3e14" max="12e14" step="1e13" value={freq}
            onChange={(e) => setFreq(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{(freq/1e14).toFixed(1)}×10¹⁴ Hz</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>光强</span>
          <input type="range" min="10" max="100" step="1" value={intensity}
            onChange={(e) => setIntensity(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{intensity}%</span>
        </label>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>反向电压</span>
          <input type="range" min={-3} max={1} step="0.01" value={voltage}
            onChange={(e) => setVoltage(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{voltage.toFixed(2)} V</span>
        </label>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>🔬</div>
          <div style={styles.placeholderTitle}>光电效应实验</div>
          <div style={styles.placeholderText}>
            模拟光电管实验，调节光频率、光强、反向电压<br />
            测绘 I-U 曲线，测定遏止电压，拟合普朗克常量 h<br /><br />
            <b>当前参数：</b><br />
            频率 f = {(freq/1e14).toFixed(1)}×10¹⁴ Hz<br />
            截止频率 f₀ = {(f0/1e14).toFixed(2)}×10¹⁴ Hz<br />
            最大初动能 Ek = {Ek_max/e > 0 ? (Ek_max/e).toFixed(2) : '0'} eV<br />
            遏止电压 Uc = {Uc > 0 ? Uc.toFixed(2) : '0'} V<br />
            光电流 I = {I.toFixed(3)} μA<br /><br />
            {freq > f0 ? '✅ 频率高于截止频率，有光电子逸出' : '❌ 频率低于截止频率，无光电子逸出'}
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：光电效应与普朗克常量测定</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          调节光频率和光强，测绘 I-U 曲线，测定遏止电压，拟合普朗克常量 h。
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
  controlBar: { background: '#fafafa', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', padding: '4px 12px', flexShrink: 0, gap: 8, overflowX: 'auto' },
  controlLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', whiteSpace: 'nowrap' },
  controlName: { fontWeight: 600, color: '#4A90D9' },
  slider: { width: 100, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 60 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
