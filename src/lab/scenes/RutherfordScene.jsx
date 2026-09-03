import { useState } from 'react'

/**
 * RutherfordScene — 卢瑟福α粒子散射实验
 *
 * 模拟α粒子轰击金箔
 * - 对比枣糕模型与原子核式模型
 * - 统计散射角度分布
 */
export default function RutherfordScene() {
  const [model, setModel] = useState('rutherford') // 'plum' | 'rutherford'
  const [energy, setEnergy] = useState(5) // MeV
  const [count, setCount] = useState(0)

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>卢瑟福α粒子散射实验</span>
        <div style={styles.topActions}>
          <button style={styles.playBtn}>▶ 发射</button>
          <button style={styles.setBtn}>⚙ 重置</button>
          <div style={styles.sep} />
          <button style={model === 'plum' ? styles.tabActive : styles.tab} onClick={() => setModel('plum')}>枣糕模型</button>
          <button style={model === 'rutherford' ? styles.tabActive : styles.tab} onClick={() => setModel('rutherford')}>核式模型</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>α粒子能量</span>
          <input type="range" min="1" max="10" step="0.5" value={energy}
            onChange={(e) => setEnergy(parseFloat(e.target.value))} style={styles.slider} />
          <span style={styles.sliderVal}>{energy} MeV</span>
        </label>
        <span style={{ fontSize: 12, color: '#888' }}>已发射: {count} 个</span>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>⚛️</div>
          <div style={styles.placeholderTitle}>α粒子散射实验</div>
          <div style={styles.placeholderText}>
            模拟α粒子轰击金箔<br />
            {model === 'plum'
              ? '枣糕模型：正电荷均匀分布，α粒子应全部直线穿过'
              : '核式模型：正电荷集中在原子核，α粒子大部分穿过，少数大角度偏转'}
            <br /><br />
            <b>实验发现：</b><br />
            绝大多数α粒子直线穿过<br />
            少数发生较大偏转<br />
            极少数被反弹回来<br /><br />
            <b>结论：</b>原子的正电荷和几乎全部质量集中在很小的原子核内
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：卢瑟福α粒子散射</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          对比枣糕模型与核式模型，发射α粒子观察散射角度分布，建立原子核式结构认识。
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
  slider: { width: 100, accentColor: '#4A90D9' },
  sliderVal: { color: '#4A90D9', fontWeight: 600, fontSize: 12, minWidth: 50 },
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
