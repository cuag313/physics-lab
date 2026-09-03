import { useState } from 'react'

/**
 * BohrScene — 玻尔氢原子能级与光谱
 *
 * 氢原子能级跃迁模拟
 * - 发射/吸收光子
 * - 生成氢原子线状光谱
 * - 计算光子波长
 */
export default function BohrScene() {
  const [selectedLevel, setSelectedLevel] = useState(3)
  const [targetLevel, setTargetLevel] = useState(2)

  // 氢原子能级 (eV): En = -13.6/n²
  const levels = [1, 2, 3, 4, 5, 6].map(n => ({
    n, E: -13.6 / (n * n), label: `n=${n}`
  }))

  const E1 = -13.6 / (selectedLevel * selectedLevel)
  const E2 = -13.6 / (targetLevel * targetLevel)
  const dE = Math.abs(E1 - E2)
  const wavelength = dE > 0 ? (1240 / dE).toFixed(1) : '∞' // nm
  const series = targetLevel === 1 ? '莱曼系(紫外)' : targetLevel === 2 ? '巴尔末系(可见)' : targetLevel === 3 ? '帕邢系(红外)' : '其他'

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <span style={styles.title}>玻尔氢原子能级与光谱</span>
        <div style={styles.topActions}>
          <button style={styles.setBtn}>⚙ 重置</button>
        </div>
      </div>
      <div style={styles.controlBar}>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>初始能级</span>
          <select value={selectedLevel} onChange={(e) => setSelectedLevel(parseInt(e.target.value))} style={styles.select}>
            {[6,5,4,3,2,1].map(n => <option key={n} value={n}>n={n}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 14, color: '#FF9800' }}>→</span>
        <label style={styles.controlLabel}>
          <span style={styles.controlName}>跃迁到</span>
          <select value={targetLevel} onChange={(e) => setTargetLevel(parseInt(e.target.value))} style={styles.select}>
            {[6,5,4,3,2,1].map(n => <option key={n} value={n}>n={n}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 12, color: '#E53935', fontWeight: 600 }}>
          {selectedLevel > targetLevel ? '发射光子' : selectedLevel < targetLevel ? '吸收光子' : '无跃迁'}
        </span>
      </div>
      <div style={styles.main}>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>🌟</div>
          <div style={styles.placeholderTitle}>氢原子能级跃迁</div>
          <div style={styles.placeholderText}>
            能级跃迁: n={selectedLevel} → n={targetLevel}<br />
            能量差: ΔE = {dE.toFixed(3)} eV<br />
            光子波长: λ = {wavelength} nm<br />
            光谱系列: {series}<br /><br />
            <b>玻尔模型：</b><br />
            E_n = -13.6/n² eV<br />
            跃迁时发射/吸收光子: hν = |ΔE|<br /><br />
            {selectedLevel > targetLevel && targetLevel === 2 && '可见光区域（巴尔末系）：Hα(红) Hβ(蓝绿) Hγ(蓝紫)'}
          </div>
        </div>
      </div>
      <div style={styles.desc}>
        <b>实验：玻尔氢原子能级与光谱</b>
        <span style={{ marginLeft: 12, color: '#555', fontSize: 13 }}>
          选择能级跃迁，计算光子波长，生成氢原子线状光谱。
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
  select: { background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
  setBtn: { background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  main: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', minHeight: 0 },
  placeholder: { textAlign: 'center', padding: 40 },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderTitle: { fontSize: 20, fontWeight: 700, color: '#333', marginBottom: 12 },
  placeholderText: { fontSize: 13, color: '#555', lineHeight: 1.8, maxWidth: 400, margin: '0 auto' },
  desc: { padding: '6px 14px', background: '#fff', borderTop: '1px solid #ddd', fontSize: 13, flexShrink: 0 },
}
