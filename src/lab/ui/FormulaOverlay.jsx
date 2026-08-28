/**
 * FormulaOverlay — 公式叠加层
 *
 * 在实验台上方实时显示物理公式推导过程
 * 核心差异化功能：NB不暴露公式，我们让学生"看见公式"
 */

export default function FormulaOverlay({ instruments, circuitValid }) {
  if (!circuitValid || instruments.length === 0) return null

  // 提取电路数据
  const batteries = instruments.filter(i => i.type === 'battery')
  const resistors = instruments.filter(i =>
    i.type === 'resistor' || i.type === 'bulb' || i.type === 'ammeter'
  )
  const voltmeters = instruments.filter(i => i.type === 'voltmeter')
  const bulbs = instruments.filter(i => i.type === 'bulb')

  // 计算总电阻、总电流
  const totalR = resistors.reduce((sum, r) => sum + (r.resistance || r.getParam?.('resistance') || 0), 0)
  const totalV = batteries.reduce((sum, b) => sum + (b.emf || b.getParam?.('emf') || 0), 0)
  const totalI = batteries.length > 0 ? batteries[0].current : 0

  if (totalR === 0) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.title}>📐 公式推导</div>

      {/* 欧姆定律 */}
      <div style={styles.formula}>
        <span style={styles.label}>欧姆定律</span>
        <span style={styles.eq}>I = U / R</span>
      </div>

      {/* 代入数值 */}
      <div style={styles.formula}>
        <span style={styles.label}>代入</span>
        <span style={styles.eq}>
          I = {totalV.toFixed(1)}V / {totalR.toFixed(1)}Ω
        </span>
      </div>

      <div style={styles.formula}>
        <span style={styles.label}>结果</span>
        <span style={{ ...styles.eq, color: '#4CAF50', fontWeight: 700 }}>
          I = {totalI.toFixed(3)}A
        </span>
      </div>

      {/* 各元件电压 */}
      {resistors.length > 1 && (
        <>
          <div style={styles.divider} />
          <div style={styles.formula}>
            <span style={styles.label}>分压</span>
            <span style={styles.eq}>U = I × R</span>
          </div>
          {resistors.map((r, i) => (
            <div key={r.id} style={styles.formula}>
              <span style={styles.label}>{r.displayName || `R${i + 1}`}</span>
              <span style={styles.eq}>
                U = {totalI.toFixed(3)} × {(r.resistance || r.getParam?.('resistance') || 0).toFixed(1)} ={' '}
                <span style={{ color: '#FFD700' }}>{r.voltage.toFixed(2)}V</span>
              </span>
            </div>
          ))}
        </>
      )}

      {/* 灯泡功率 */}
      {bulbs.length > 0 && (
        <>
          <div style={styles.divider} />
          <div style={styles.formula}>
            <span style={styles.label}>功率</span>
            <span style={styles.eq}>P = U × I</span>
          </div>
          {bulbs.map((b, i) => (
            <div key={b.id} style={styles.formula}>
              <span style={styles.label}>💡{i + 1}</span>
              <span style={styles.eq}>
                P = {b.voltage.toFixed(2)} × {b.current.toFixed(3)} ={' '}
                <span style={{ color: '#FF9800' }}>{(b.voltage * b.current).toFixed(2)}W</span>
              </span>
            </div>
          ))}
        </>
      )}

      {/* 基尔霍夫定律 */}
      {resistors.length > 1 && (
        <>
          <div style={styles.divider} />
          <div style={styles.formula}>
            <span style={styles.label}>KVL验证</span>
            <span style={styles.eq}>
              ΣU = {resistors.map(r => r.voltage.toFixed(2)).join(' + ')} ={' '}
              {resistors.reduce((s, r) => s + r.voltage, 0).toFixed(2)}V
              {' ≈ '}
              {totalV.toFixed(1)}V ✓
            </span>
          </div>
        </>
      )}
    </div>
  )
}

const styles = {
  overlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    background: 'rgba(13, 17, 23, 0.92)',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 260,
    maxWidth: 360,
    backdropFilter: 'blur(8px)',
    zIndex: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: '#c9d1d9',
    marginBottom: 8,
    borderBottom: '1px solid #21262d',
    paddingBottom: 6,
  },
  formula: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '3px 0',
  },
  label: {
    fontSize: 11,
    color: '#8b949e',
    minWidth: 50,
    textAlign: 'right',
  },
  eq: {
    fontSize: 13,
    fontFamily: '"Courier New", monospace',
    color: '#e6edf3',
  },
  divider: {
    height: 1,
    background: '#21262d',
    margin: '5px 0',
  },
}
